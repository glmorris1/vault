import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AIPhotoAnalysis, AIPhotoSuggestion, VaultImage, VaultItem, VaultLocation, VaultRoom } from "./types";

initializeApp();

// Add this secret before deploying:
// firebase functions:secrets:set OPENAI_API_KEY
const openaiApiKey = defineSecret("OPENAI_API_KEY");
const alexaClientSecret = defineSecret("ALEXA_CLIENT_SECRET");
const ALEXA_CLIENT_ID_VALUE = "vault-alexa-skill";
const VAULT_FIREBASE_WEB_API_KEY_VALUE = "AIzaSyC4AV1Ge2eT9LKcb3TULzGUuEtv_7Hcw6U";
const OPENAI_MODEL = "gpt-4o-mini";
const STORAGE_BUCKET = "vault-4e944.firebasestorage.app";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const HOUSEHOLD_ITEM_ALIASES: Record<string, string[]> = {
  "adhesive bandages": ["bandages", "bandaids", "band aids"],
  batteries: ["battery"],
  "birthday candles": ["candles"],
  "bottle opener": ["opener"],
  bulbs: ["bulb", "light bulbs", "light bulb"],
  "cable ties": ["zip ties", "zip tie"],
  charger: ["chargers", "charging cable", "charging cord"],
  cords: ["cord", "cables", "cable"],
  "extension cord": ["extension cable"],
  flashlight: ["flashlights"],
  forks: ["fork"],
  keys: ["key"],
  "light bulbs": ["light bulb", "bulbs", "bulb"],
  matches: ["match"],
  "measuring tape": ["tape measure"],
  medicine: ["medication", "medications"],
  nails: ["nail"],
  napkins: ["napkin"],
  "packing tape": ["tape"],
  "paper clips": ["paper clip"],
  pens: ["pen"],
  plates: ["plate", "dishes", "dish"],
  pliers: ["plier"],
  "rubber bands": ["rubber band"],
  "safety pins": ["safety pin"],
  scissors: ["scissor"],
  screwdriver: ["screwdrivers"],
  screws: ["screw"],
  socks: ["sock"],
  spoons: ["spoon"],
  stamps: ["stamp"],
  tape: ["packing tape"],
  thumbtacks: ["thumb tacks", "tacks"],
  "trash bags": ["trash bag", "garbage bags", "garbage bag"],
  "zip ties": ["zip tie", "cable ties", "cable tie"],
};

export const analyzePhotoWithAI = onCall(
  {
    secrets: [openaiApiKey],
    timeoutSeconds: 120,
    memory: "1GiB",
    cors: true,
  },
  async (request): Promise<AIPhotoAnalysis> => {
    try {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError("unauthenticated", "Sign in before using AI photo analysis.");
      }
      logger.info("analyzePhotoWithAI started", { uid });

      const imageId = readString(request.data?.imageId, "imageId");
      const storagePath = readString(request.data?.storagePath, "storagePath");
      const photoWidth = readOptionalNumber(request.data?.photoWidth);
      const photoHeight = readOptionalNumber(request.data?.photoHeight);
      logger.info("analyzePhotoWithAI request parsed", { uid, imageId, storagePath, photoWidth, photoHeight });

      if (!storagePath.startsWith(`users/${uid}/images/`)) {
        throw new HttpsError("permission-denied", "This photo does not belong to the signed-in user.");
      }

      await verifyPhotoIsInUserVault(uid, imageId, storagePath);
      logger.info("analyzePhotoWithAI ownership verified", { uid, imageId });

      const file = getStorage().bucket(STORAGE_BUCKET).file(storagePath);
      const [metadata] = await file.getMetadata().catch(() => {
        throw new HttpsError("not-found", "Photo was not found in Firebase Storage.");
      });
      logger.info("analyzePhotoWithAI storage metadata loaded", {
        uid,
        imageId,
        size: metadata.size,
        contentType: metadata.contentType,
      });

      const size = Number(metadata.size || 0);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
        throw new HttpsError("invalid-argument", "Photo is too large for AI analysis.");
      }

      const [imageBuffer] = await file.download();
      logger.info("analyzePhotoWithAI image downloaded", { uid, imageId, bytes: imageBuffer.byteLength });
      const contentType = metadata.contentType || "image/jpeg";
      const dataUrl = `data:${contentType};base64,${imageBuffer.toString("base64")}`;

      const analysis = await callOpenAI(dataUrl, photoWidth, photoHeight);
      logger.info("analyzePhotoWithAI OpenAI analysis returned", {
        uid,
        imageId,
        suggestions: analysis.suggestions.length,
      });

      await saveAIAnalysis(uid, {
        imageId,
        storagePath,
        photoWidth,
        photoHeight,
        model: OPENAI_MODEL,
        analysis,
      });
      logger.info("analyzePhotoWithAI completed", { uid, imageId });

      return analysis;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("analyzePhotoWithAI unexpected failure", error);
      throw new HttpsError("failed-precondition", "AI analysis could not start on the server. Please try again.");
    }
  },
);

export const alexaVaultSkill = onRequest(
  {
    timeoutSeconds: 30,
    memory: "512MiB",
    cors: false,
  },
  async (request, response) => {
    try {
      const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
      const requestType = body?.request?.type || "";
      const intentName = body?.request?.intent?.name || "";
      if (request.method !== "POST") {
        response.status(200).send("Vault Alexa endpoint is ready.");
        return;
      }

      if (requestType === "LaunchRequest") {
        response.status(200).json(alexaSpeak("Welcome to Vault."));
        return;
      }

      if (requestType === "SessionEndedRequest") {
        response.status(200).json({ version: "1.0", response: {} });
        return;
      }

      if (requestType === "IntentRequest") {
        const uid = await resolveAlexaVaultUserFromEnvelope(body);
        if (!uid) {
          response.status(200).json({
            version: "1.0",
            response: {
              outputSpeech: { type: "PlainText", text: "Please link your Vault account in the Alexa app before I can search your Vault." },
              card: { type: "LinkAccount" },
              shouldEndSession: true,
            },
          });
          return;
        }

        if (["FindItemIntent", "SearchVaultIntent"].includes(intentName)) {
          const query = getEnvelopeSlotValue(body, "item") || getEnvelopeSlotValue(body, "query");
          if (!query) {
            response.status(200).json(alexaSpeak("What item would you like me to find in Vault?", "Say something like, where are the scissors?", false));
            return;
          }

          const matches = await searchUserVault(uid, query);
          if (matches.length === 0) {
            response.status(200).json(alexaSpeak(`I could not find ${query} in your Vault yet.`, "You can ask me to find another item.", false));
            return;
          }

          const best = matches[0];
          const more = matches.length > 1 ? `I found ${matches.length} matches. The first one is ` : "";
          response.status(200).json(alexaSpeak(`${more}${best.name} is in ${speakPath(best.path)}.`));
          return;
        }

        if (["ListPinItemsIntent", "WhatIsInIntent"].includes(intentName)) {
          const query = getEnvelopeSlotValue(body, "pin") || getEnvelopeSlotValue(body, "place") || getEnvelopeSlotValue(body, "query");
          if (!query) {
            response.status(200).json(alexaSpeak("Which drawer, shelf, cabinet, or pin should I check?", "Say something like, what is in the left drawer?", false));
            return;
          }

          const matches = await searchPinsInUserVault(uid, query);
          if (matches.length === 0) {
            response.status(200).json(alexaSpeak(`I could not find a Vault pin named ${query}.`, "You can ask about another drawer, shelf, or cabinet.", false));
            return;
          }

          const best = matches[0];
          const items = best.items.slice(0, 8).map((item) => item.name).filter(Boolean);
          const itemSpeech = items.length > 0 ? items.join(", ") : "no listed items yet";
          response.status(200).json(alexaSpeak(`${best.name} has ${itemSpeech}. It is in ${speakPath(best.path)}.`));
          return;
        }

        if (intentName === "AMAZON.HelpIntent") {
          response.status(200).json(alexaSpeak("You can ask Vault where an item is, like, where are the batteries, or ask what is in a pin, like, what is in the left drawer.", "Try asking, where are the batteries?", false));
          return;
        }

        if (["AMAZON.CancelIntent", "AMAZON.StopIntent"].includes(intentName)) {
          response.status(200).json(alexaSpeak("Okay."));
          return;
        }
      }

      response.status(200).json(alexaSpeak("I can search your Vault for items or tell you what is listed inside a pin.", "Try asking, where are the scissors?", false));
    } catch (error: any) {
      logger.error(`Alexa Vault skill request failed: ${error?.message || error}`);
      response.status(200).json(alexaSpeak("Sorry, Vault had trouble answering that. Please try again.", "Try asking, where are the batteries?", false));
    }
  },
);

export const alexaAuthorize = onRequest(
  {
    timeoutSeconds: 30,
    memory: "512MiB",
    cors: false,
  },
  async (request, response) => {
    try {
      if (request.method === "GET") {
        response.status(200).send(renderAlexaLoginPage(readAuthorizeParams(request.query)));
        return;
      }

      if (request.method !== "POST") {
        response.status(405).send("Method not allowed");
        return;
      }

      const params = readAuthorizeParams(request.body);
      const email = readFormString(request.body.email);
      const password = readFormString(request.body.password);
      const uid = await signInWithFirebasePassword(email, password);
      const code = await createAlexaAuthorizationCode(uid, params);
      const redirectUrl = new URL(params.redirectUri);
      redirectUrl.searchParams.set("state", params.state);
      redirectUrl.searchParams.set("code", code);
      response.redirect(302, redirectUrl.toString());
    } catch (error) {
      logger.error("Alexa authorize failed", error);
      response.status(400).send(renderAlexaLoginPage(readAuthorizeParams(request.method === "POST" ? request.body : request.query), readableAuthorizeError(error)));
    }
  },
);

export const alexaToken = onRequest(
  {
    secrets: [alexaClientSecret],
    timeoutSeconds: 30,
    memory: "512MiB",
    cors: false,
  },
  async (request, response) => {
    try {
      if (request.method !== "POST") {
        response.status(405).json({ error: "invalid_request" });
        return;
      }

      verifyAlexaClient(request);
      const grantType = readFormString(request.body.grant_type);
      if (grantType === "authorization_code") {
        const token = await exchangeAlexaAuthorizationCode(readFormString(request.body.code), readFormString(request.body.redirect_uri));
        response.status(200).json(token);
        return;
      }

      if (grantType === "refresh_token") {
        const token = await refreshAlexaAccessToken(readFormString(request.body.refresh_token));
        response.status(200).json(token);
        return;
      }

      response.status(400).json({ error: "unsupported_grant_type" });
    } catch (error) {
      logger.error("Alexa token failed", error);
      response.status(400).json({ error: "invalid_grant" });
    }
  },
);

function alexaSpeak(text: string, reprompt = "", shouldEndSession = true) {
  const response: any = {
    outputSpeech: { type: "PlainText", text },
    shouldEndSession,
  };
  if (reprompt) {
    response.reprompt = { outputSpeech: { type: "PlainText", text: reprompt } };
  }
  return { version: "1.0", response };
}

function getEnvelopeSlotValue(envelope: any, slotName: string) {
  const value = envelope?.request?.intent?.slots?.[slotName]?.value;
  return typeof value === "string" ? value.trim() : "";
}

async function resolveAlexaVaultUserFromEnvelope(envelope: any) {
  const system = envelope?.context?.System || envelope?.session;
  const accessToken = system?.user?.accessToken || envelope?.session?.user?.accessToken;
  if (accessToken) {
    const uidFromOAuth = await resolveAlexaAccessToken(accessToken);
    if (uidFromOAuth) return uidFromOAuth;

    try {
      const decoded = await getAuth().verifyIdToken(accessToken);
      return decoded.uid;
    } catch (error) {
      logger.warn("Alexa envelope access token was not a Firebase ID token", error);
    }
  }

  const alexaUserId = system?.user?.userId || envelope?.session?.user?.userId;
  if (!alexaUserId) return "";
  const linkSnapshot = await getFirestore().collection("alexaLinks").doc(alexaUserId).get();
  const uid = linkSnapshot.data()?.uid;
  return typeof uid === "string" && uid ? uid : "";
}




async function resolveAlexaAccessToken(accessToken: string) {
  const snapshot = await getFirestore().collection("alexaAccessTokens").doc(hashToken(accessToken)).get();
  const data = snapshot.data();
  if (!data) return "";
  const expiresAt = data.expiresAt?.toMillis?.() || 0;
  if (expiresAt <= Date.now()) return "";
  return typeof data.uid === "string" ? data.uid : "";
}

interface AlexaAuthorizeParams {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope: string;
  state: string;
}

function readAuthorizeParams(source: any): AlexaAuthorizeParams {
  return {
    clientId: readFormString(source?.client_id),
    redirectUri: readFormString(source?.redirect_uri),
    responseType: readFormString(source?.response_type || "code"),
    scope: readFormString(source?.scope || "vault:read"),
    state: readFormString(source?.state),
  };
}

function renderAlexaLoginPage(params: AlexaAuthorizeParams, errorMessage = "") {
  const hiddenInputs = Object.entries({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: params.responseType,
    scope: params.scope,
    state: params.state,
  })
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Link Vault to Alexa</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fff6fa; color: #5d6066; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(92vw, 430px); background: white; border-radius: 28px; box-shadow: 0 20px 50px rgba(120, 52, 90, .18); padding: 28px; }
      h1 { margin: 0; font-size: 32px; letter-spacing: .08em; text-transform: uppercase; color: #7a315f; }
      p { line-height: 1.5; font-weight: 650; }
      label { display: grid; gap: 8px; margin-top: 16px; font-weight: 800; }
      input { min-height: 48px; border-radius: 16px; border: 1px solid #f4cad9; padding: 0 14px; font-size: 16px; }
      button { width: 100%; min-height: 52px; margin-top: 22px; border: 0; border-radius: 18px; background: #168de2; color: white; font-size: 16px; font-weight: 900; }
      .error { color: #b42318; background: #fff1f1; border-radius: 16px; padding: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Vault</h1>
      <p>Sign in to link Vault with Alexa. Alexa will be able to search your saved locations, pins, and items.</p>
      ${errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : ""}
      <form method="post">
        ${hiddenInputs}
        <label>Email <input type="email" name="email" autocomplete="email" required /></label>
        <label>Password <input type="password" name="password" autocomplete="current-password" required /></label>
        <button type="submit">Link Vault to Alexa</button>
      </form>
    </main>
  </body>
</html>`;
}

async function signInWithFirebasePassword(email: string, password: string) {
  const apiKey = VAULT_FIREBASE_WEB_API_KEY_VALUE;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  const payload = await response.json();
  if (!response.ok || typeof payload.localId !== "string") {
    throw new Error("Vault sign in failed.");
  }

  return payload.localId;
}

async function createAlexaAuthorizationCode(uid: string, params: AlexaAuthorizeParams) {
  validateAlexaOAuthRequest(params);
  const code = randomToken();
  await getFirestore().collection("alexaAuthCodes").doc(hashToken(code)).set({
    uid,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    scope: params.scope,
    expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS),
    createdAt: FieldValue.serverTimestamp(),
  });
  return code;
}

async function exchangeAlexaAuthorizationCode(code: string, redirectUri: string) {
  const codeRef = getFirestore().collection("alexaAuthCodes").doc(hashToken(code));
  const snapshot = await codeRef.get();
  const data = snapshot.data();
  await codeRef.delete().catch(() => undefined);

  if (!data || data.redirectUri !== redirectUri || (data.expiresAt?.toMillis?.() || 0) <= Date.now()) {
    throw new Error("Invalid authorization code.");
  }

  return issueAlexaTokens(String(data.uid), String(data.scope || "vault:read"));
}

async function refreshAlexaAccessToken(refreshToken: string) {
  const snapshot = await getFirestore().collection("alexaRefreshTokens").doc(hashToken(refreshToken)).get();
  const data = snapshot.data();
  if (!data || (data.expiresAt?.toMillis?.() || 0) <= Date.now()) {
    throw new Error("Invalid refresh token.");
  }
  return issueAlexaTokens(String(data.uid), String(data.scope || "vault:read"), refreshToken);
}

async function issueAlexaTokens(uid: string, scope: string, existingRefreshToken = "") {
  const accessToken = randomToken();
  const refreshToken = existingRefreshToken || randomToken();
  const now = Date.now();
  await getFirestore().collection("alexaAccessTokens").doc(hashToken(accessToken)).set({
    uid,
    scope,
    expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
    createdAt: FieldValue.serverTimestamp(),
  });
  await getFirestore().collection("alexaRefreshTokens").doc(hashToken(refreshToken)).set({
    uid,
    scope,
    expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
  };
}

function validateAlexaOAuthRequest(params: AlexaAuthorizeParams) {
  if (params.clientId !== ALEXA_CLIENT_ID_VALUE) {
    throw new Error("Invalid client id.");
  }
  if (params.responseType !== "code") {
    throw new Error("Invalid response type.");
  }
  if (!params.redirectUri.startsWith("https://")) {
    throw new Error("Invalid redirect URI.");
  }
}

function verifyAlexaClient(request: any) {
  const expectedId = ALEXA_CLIENT_ID_VALUE;
  const expectedSecret = alexaClientSecret.value();
  const auth = String(request.headers.authorization || "");
  const [scheme, encoded] = auth.split(" ");
  let clientId = "";
  let clientSecret = "";

  if (scheme?.toLowerCase() === "basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    clientId = decodeURIComponent(decoded.slice(0, separatorIndex));
    clientSecret = decodeURIComponent(decoded.slice(separatorIndex + 1));
  }

  if (!clientId && typeof request.body?.client_id === "string") {
    clientId = request.body.client_id.trim();
  }

  if (!clientSecret && typeof request.body?.client_secret === "string") {
    clientSecret = request.body.client_secret.trim();
  }

  const secretMatches = safeEqual(clientSecret, expectedSecret);

  if (clientId !== expectedId || !secretMatches) {
    throw new Error("Invalid client credentials.");
  }
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function readFormString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readableAuthorizeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Vault could not link Alexa.";
  if (message.includes("sign in")) return "That Vault email or password did not work. Please try again.";
  return "Vault could not link Alexa. Please try again.";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}



async function searchUserVault(uid: string, query: string) {
  const locations = await loadVaultLocations(uid);
  const normalizedQuery = normalizeSearch(query);
  const results: Array<{ name: string; path: string[]; score: number }> = [];

  for (const location of locations) {
    for (const { image, room } of getVaultImages(location)) {
      for (const pin of image.pins || []) {
        for (const item of pin.items || []) {
          const text = normalizeSearch([item.name, item.notes, item.quantity, item.estimatedValue, pin.name, image.name, room?.name, location.name].join(" "));
          if (searchTextMatches(text, normalizedQuery)) {
            results.push({
              name: item.name || pin.name || "Item",
              path: compactPath(location.name, room?.name, image.name, pin.name),
              score: scoreMatch(item.name, normalizedQuery),
            });
          }
        }
      }
    }
  }

  return results.sort((a, b) => b.score - a.score || a.path.join(" ").localeCompare(b.path.join(" "))).slice(0, 5);
}

async function searchPinsInUserVault(uid: string, query: string) {
  const locations = await loadVaultLocations(uid);
  const normalizedQuery = normalizeSearch(query);
  const results: Array<{ name: string; path: string[]; items: VaultItem[]; score: number }> = [];

  for (const location of locations) {
    for (const { image, room } of getVaultImages(location)) {
      for (const pin of image.pins || []) {
        const text = normalizeSearch([pin.name, pin.notes, image.name, room?.name, location.name].join(" "));
        if (text.includes(normalizedQuery)) {
          results.push({
            name: pin.name || "Unnamed pin",
            path: compactPath(location.name, room?.name, image.name, pin.name),
            items: pin.items || [],
            score: scoreMatch(pin.name, normalizedQuery),
          });
        }
      }
    }
  }

  return results.sort((a, b) => b.score - a.score || a.path.join(" ").localeCompare(b.path.join(" "))).slice(0, 5);
}

async function loadVaultLocations(uid: string): Promise<VaultLocation[]> {
  const snapshot = await getFirestore().collection("vaults").doc(uid).get();
  const locations = snapshot.data()?.data?.locations;
  return Array.isArray(locations) ? locations : [];
}

function getVaultImages(location: VaultLocation): Array<{ image: VaultImage; room?: VaultRoom }> {
  return [
    ...(location.images || []).map((image) => ({ image, room: undefined })),
    ...(location.rooms || []).flatMap((room) => (room.images || []).map((image) => ({ image, room }))),
  ];
}

function compactPath(...parts: Array<string | undefined>) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean);
}

function speakPath(path: string[]) {
  return path.join(", ");
}



function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreMatch(value: string | undefined, normalizedQuery: string) {
  const normalizedValue = normalizeSearch(value || "");
  for (const term of searchTerms(normalizedQuery)) {
    if (normalizedValue === term) return 100;
  }
  for (const term of searchTerms(normalizedQuery)) {
    if (normalizedValue.startsWith(term)) return 50;
  }
  for (const term of searchTerms(normalizedQuery)) {
    if (normalizedValue.includes(term)) return 25;
  }
  return 1;
}

function searchTextMatches(normalizedText: string, normalizedQuery: string) {
  return searchTerms(normalizedQuery).some((term) => normalizedText.includes(term));
}

function searchTerms(normalizedValue: string) {
  const terms = new Set([normalizedValue]);
  const singular = singularize(normalizedValue);
  const plural = pluralize(normalizedValue);
  terms.add(singular);
  terms.add(plural);

  for (const [item, aliases] of Object.entries(HOUSEHOLD_ITEM_ALIASES)) {
    const normalizedItem = normalizeSearch(item);
    const normalizedAliases = aliases.map(normalizeSearch);
    if ([normalizedItem, ...normalizedAliases].some((term) => terms.has(term))) {
      terms.add(normalizedItem);
      normalizedAliases.forEach((term) => terms.add(term));
    }
  }

  return [...terms].filter(Boolean);
}

function singularize(value: string) {
  if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.endsWith("es")) return value.slice(0, -2);
  if (value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

function pluralize(value: string) {
  if (value.endsWith("y")) return `${value.slice(0, -1)}ies`;
  if (value.endsWith("s")) return value;
  return `${value}s`;
}

async function saveAIAnalysis(uid: string, record: Record<string, unknown>) {
  try {
    await getFirestore()
      .collection("vaults")
      .doc(uid)
      .collection("aiAnalyses")
      .add({
        ...record,
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (error) {
    logger.error("AI analysis audit write failed", error);
  }
}

async function verifyPhotoIsInUserVault(uid: string, imageId: string, storagePath: string) {
  const snapshot = await getFirestore().collection("vaults").doc(uid).get();
  const locations: Array<{
    images?: Array<{
      id?: string;
      storagePath?: string;
      pins?: Array<{
        photos?: Array<{ id?: string; storagePath?: string }>;
      }>;
    }>;
    rooms?: Array<{
      images?: Array<{
        id?: string;
        storagePath?: string;
        pins?: Array<{
          photos?: Array<{ id?: string; storagePath?: string }>;
        }>;
      }>;
    }>;
  }> = snapshot.data()?.data?.locations;
  if (!Array.isArray(locations)) {
    throw new HttpsError("not-found", "No Vault data was found for this user.");
  }

  const ownsPhoto = locations.some((location) =>
    getAllLocationImages(location).some((image) => {
      if (image?.id === imageId && image?.storagePath === storagePath) return true;
      return image?.pins?.some((pin) =>
        pin.photos?.some((photo) => photo?.id === imageId && photo?.storagePath === storagePath),
      );
    }),
  );

  if (!ownsPhoto) {
    throw new HttpsError("permission-denied", "This photo is not registered in the signed-in user's Vault.");
  }
}

function getAllLocationImages(location: {
  images?: Array<{
    id?: string;
    storagePath?: string;
    pins?: Array<{ photos?: Array<{ id?: string; storagePath?: string }> }>;
  }>;
  rooms?: Array<{
    images?: Array<{
      id?: string;
      storagePath?: string;
      pins?: Array<{ photos?: Array<{ id?: string; storagePath?: string }> }>;
    }>;
  }>;
}) {
  return [
    ...(Array.isArray(location.images) ? location.images : []),
    ...(Array.isArray(location.rooms)
      ? location.rooms.flatMap((room) => (Array.isArray(room.images) ? room.images : []))
      : []),
  ];
}

async function callOpenAI(imageDataUrl: string, photoWidth?: number, photoHeight?: number): Promise<AIPhotoAnalysis> {
  const apiKey = openaiApiKey.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "OPENAI_API_KEY is not configured for Cloud Functions.");
  }

  try {
    logger.info("OpenAI analysis request starting", { model: OPENAI_MODEL });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt(photoWidth, photoHeight),
              },
              {
                type: "input_image",
                image_url: imageDataUrl,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "vault_photo_analysis",
            strict: true,
            schema: analysisSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("OpenAI analysis HTTP error", { status: response.status, errorText: errorText.slice(0, 1000) });
      throw new HttpsError("failed-precondition", readableOpenAIError(errorText));
    }

    const payload = await response.json();
    logger.info("OpenAI analysis response received");
    const outputText = extractOutputText(payload);
    if (!outputText) {
      throw new HttpsError("data-loss", "AI analysis returned no readable suggestions. Please try another photo.");
    }

    return normalizeAnalysis(safeParseAnalysis(outputText));
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("OpenAI analysis call failed unexpectedly", error);
    throw new HttpsError("failed-precondition", "OpenAI analysis could not complete. Please try again.");
  }
}

function safeParseAnalysis(outputText: string) {
  try {
    return JSON.parse(outputText);
  } catch (error) {
    logger.error("AI analysis JSON parse failed", error, { outputPreview: outputText.slice(0, 500) });
    throw new HttpsError("data-loss", "AI returned unreadable suggestions. Please try another photo.");
  }
}

function readableOpenAIError(errorText: string) {
  try {
    const parsed = JSON.parse(errorText);
    const message = parsed?.error?.message;
    if (typeof message === "string" && message.trim()) {
      return `OpenAI could not analyze this photo: ${message.slice(0, 240)}`;
    }
  } catch {
    // Fall back to a generic message below.
  }

  return "OpenAI could not analyze this photo right now. Please try again.";
}

function buildPrompt(photoWidth?: number, photoHeight?: number) {
  const dimensions =
    photoWidth && photoHeight
      ? `The source photo is ${photoWidth} pixels wide and ${photoHeight} pixels high.`
      : "The source photo dimensions were not provided.";

  return [
    "You are helping organize a home inventory app.",
    "Analyze this image and suggest pin locations for visible storage areas or visible groups of items.",
    dimensions,
    "Use all coordinate percentages from 0 to 100, where 0,0 is the top-left of the image and 100,100 is the bottom-right.",
    "For every suggestion, estimate the full visible bounding rectangle of the target object or storage area.",
    "Set xMinPercent to the left edge of that target, xMaxPercent to the right edge, yMinPercent to the top edge, and yMaxPercent to the bottom edge.",
    "Set xPercent to the midpoint between xMinPercent and xMaxPercent. Set yPercent to the midpoint between yMinPercent and yMaxPercent.",
    "The coordinate must be the visual center of the object itself, not a corner, edge, label, handle edge, or nearby empty space.",
    "For a drawer, place the pin in the center of the drawer front, often near the drawer pull or handle if that is centered.",
    "For a cabinet, place the pin in the center of the cabinet door or visible cabinet opening.",
    "For a shelf, place the pin in the center of that shelf span or shelf opening.",
    "For a bin, box, appliance, or visible item group, place the pin in the center of its visible body.",
    "Before returning JSON, self-check each rectangle and midpoint: if the midpoint is left of, right of, above, below, or beside the object, correct the rectangle edges so the midpoint lands on the object's center.",
    "Do not place pins beside the object or offset left/down from the object. The pin coordinate should land on the object's visual center.",
    "Suggest a pin for every visible drawer, shelf, cabinet, closet section, bin, box, and meaningful storage surface you can distinguish.",
    "Avoid placing multiple pins tightly clustered next to each other; if several suggested pins would overlap, choose the center of each distinct storage area or merge duplicate suggestions.",
    "Return only JSON matching the provided schema.",
    "Do not identify people.",
    "Do not guess hidden contents.",
    "If a cabinet, drawer, box, or container is closed, label the storage area only and leave visibleItems empty unless items are actually visible.",
    "If a cabinet, drawer, bin, shelf, or container is open and items are visible, suggest concise likely item names.",
  ].join(" ");
}

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["photoType", "summary", "suggestions"],
  properties: {
    photoType: {
      type: "string",
      enum: ["room", "cabinet", "drawer", "closet", "shelf", "other"],
    },
    summary: {
      type: "string",
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "label",
          "type",
          "xPercent",
          "yPercent",
          "xMinPercent",
          "yMinPercent",
          "xMaxPercent",
          "yMaxPercent",
          "confidence",
          "visibleItems",
          "notes",
        ],
        properties: {
          id: {
            type: "string",
          },
          label: {
            type: "string",
          },
          type: {
            type: "string",
            enum: ["cabinet", "drawer", "shelf", "bin", "box", "appliance", "closet", "countertop", "other"],
          },
          xPercent: {
            type: "number",
            minimum: 0,
            maximum: 100,
          },
          yPercent: {
            type: "number",
            minimum: 0,
            maximum: 100,
          },
          xMinPercent: {
            type: "number",
            minimum: 0,
            maximum: 100,
          },
          yMinPercent: {
            type: "number",
            minimum: 0,
            maximum: 100,
          },
          xMaxPercent: {
            type: "number",
            minimum: 0,
            maximum: 100,
          },
          yMaxPercent: {
            type: "number",
            minimum: 0,
            maximum: 100,
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          visibleItems: {
            type: "array",
            items: {
              type: "string",
            },
          },
          notes: {
            type: "string",
          },
        },
      },
    },
  },
} as const;

function extractOutputText(payload: any): string {
  if (typeof payload.output_text === "string") return payload.output_text;

  const parts = payload.output
    ?.flatMap((item: any) => item.content || [])
    ?.filter((content: any) => content.type === "output_text" && typeof content.text === "string")
    ?.map((content: any) => content.text);

  return parts?.join("") || "";
}

function normalizeAnalysis(raw: any): AIPhotoAnalysis {
  const suggestions = Array.isArray(raw?.suggestions) ? raw.suggestions : [];
  return {
    photoType: ["room", "cabinet", "drawer", "closet", "shelf", "other"].includes(raw?.photoType) ? raw.photoType : "other",
    summary: String(raw?.summary || "").slice(0, 240),
    suggestions: suggestions.map(normalizeSuggestion),
  };
}

function normalizeSuggestion(raw: any, index: number): AIPhotoSuggestion {
  const xPercent = midpointFromBounds(raw?.xMinPercent, raw?.xMaxPercent, raw?.xPercent);
  const yPercent = midpointFromBounds(raw?.yMinPercent, raw?.yMaxPercent, raw?.yPercent);

  return {
    id: String(raw?.id || `ai-${index + 1}`),
    label: String(raw?.label || "Suggested pin").slice(0, 80),
    type: ["cabinet", "drawer", "shelf", "bin", "box", "appliance", "closet", "countertop", "other"].includes(raw?.type)
      ? raw.type
      : "other",
    xPercent,
    yPercent,
    confidence: clampNumber(raw?.confidence, 0, 1),
    visibleItems: Array.isArray(raw?.visibleItems) ? raw.visibleItems.map((item: unknown) => String(item).slice(0, 60)).filter(Boolean) : [],
    notes: String(raw?.notes || "Only include what is visible. Do not guess hidden contents.").slice(0, 240),
  };
}

function midpointFromBounds(minValue: unknown, maxValue: unknown, fallback: unknown) {
  const min = Number(minValue);
  const max = Number(maxValue);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return clampNumber((Math.min(min, max) + Math.max(min, max)) / 2, 0, 100);
  }
  return clampNumber(fallback, 0, 100);
}

function readString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }
  return value.trim();
}

function readOptionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
