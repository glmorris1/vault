import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import type { AIPhotoAnalysis, AIPhotoSuggestion } from "./types";

initializeApp();

// Add this secret before deploying:
// firebase functions:secrets:set OPENAI_API_KEY
const openaiApiKey = defineSecret("OPENAI_API_KEY");
const OPENAI_MODEL = "gpt-4o-mini";
const STORAGE_BUCKET = "vault-4e944.firebasestorage.app";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

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
  }> = snapshot.data()?.data?.locations;
  if (!Array.isArray(locations)) {
    throw new HttpsError("not-found", "No Vault data was found for this user.");
  }

  const ownsPhoto = locations.some((location) =>
    Array.isArray(location.images) &&
    location.images.some((image) => {
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
