import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
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

      const imageId = readString(request.data?.imageId, "imageId");
      const storagePath = readString(request.data?.storagePath, "storagePath");
      const photoWidth = readOptionalNumber(request.data?.photoWidth);
      const photoHeight = readOptionalNumber(request.data?.photoHeight);

      if (!storagePath.startsWith(`users/${uid}/images/`)) {
        throw new HttpsError("permission-denied", "This photo does not belong to the signed-in user.");
      }

      await verifyPhotoIsInUserVault(uid, imageId, storagePath);

      const file = getStorage().bucket(STORAGE_BUCKET).file(storagePath);
      const [metadata] = await file.getMetadata().catch(() => {
        throw new HttpsError("not-found", "Photo was not found in Firebase Storage.");
      });

      const size = Number(metadata.size || 0);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
        throw new HttpsError("invalid-argument", "Photo is too large for AI analysis.");
      }

      const [imageBuffer] = await file.download();
      const contentType = metadata.contentType || "image/jpeg";
      const dataUrl = `data:${contentType};base64,${imageBuffer.toString("base64")}`;

      const analysis = await callOpenAI(dataUrl, photoWidth, photoHeight);

      await saveAIAnalysis(uid, {
        imageId,
        storagePath,
        photoWidth,
        photoHeight,
        model: OPENAI_MODEL,
        analysis,
      });

      return analysis;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("analyzePhotoWithAI unexpected failure", error);
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
    console.error("AI analysis audit write failed", error);
  }
}

async function verifyPhotoIsInUserVault(uid: string, imageId: string, storagePath: string) {
  const snapshot = await getFirestore().collection("vaults").doc(uid).get();
  const locations: Array<{ images?: Array<{ id?: string; storagePath?: string }> }> = snapshot.data()?.data?.locations;
  if (!Array.isArray(locations)) {
    throw new HttpsError("not-found", "No Vault data was found for this user.");
  }

  const ownsPhoto = locations.some((location) =>
    Array.isArray(location.images) &&
    location.images.some((image) => image?.id === imageId && image?.storagePath === storagePath),
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
      throw new HttpsError("failed-precondition", readableOpenAIError(errorText));
    }

    const payload = await response.json();
    const outputText = extractOutputText(payload);
    if (!outputText) {
      throw new HttpsError("data-loss", "AI analysis returned no readable suggestions. Please try another photo.");
    }

    return normalizeAnalysis(safeParseAnalysis(outputText));
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("OpenAI analysis call failed unexpectedly", error);
    throw new HttpsError("failed-precondition", "OpenAI analysis could not complete. Please try again.");
  }
}

function safeParseAnalysis(outputText: string) {
  try {
    return JSON.parse(outputText);
  } catch (error) {
    console.error("AI analysis JSON parse failed", error, outputText.slice(0, 500));
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
    "Use xPercent and yPercent from 0 to 100, where 0,0 is the top-left of the image and 100,100 is the bottom-right.",
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
        required: ["id", "label", "type", "xPercent", "yPercent", "confidence", "visibleItems", "notes"],
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
  return {
    id: String(raw?.id || `ai-${index + 1}`),
    label: String(raw?.label || "Suggested pin").slice(0, 80),
    type: ["cabinet", "drawer", "shelf", "bin", "box", "appliance", "closet", "countertop", "other"].includes(raw?.type)
      ? raw.type
      : "other",
    xPercent: clampNumber(raw?.xPercent, 0, 100),
    yPercent: clampNumber(raw?.yPercent, 0, 100),
    confidence: clampNumber(raw?.confidence, 0, 1),
    visibleItems: Array.isArray(raw?.visibleItems) ? raw.visibleItems.map((item: unknown) => String(item).slice(0, 60)).filter(Boolean) : [],
    notes: String(raw?.notes || "Only include what is visible. Do not guess hidden contents.").slice(0, 240),
  };
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
