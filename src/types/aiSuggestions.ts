export type AIPhotoType = "room" | "cabinet" | "drawer" | "closet" | "shelf" | "other";

export type AISuggestionType = "cabinet" | "drawer" | "shelf" | "bin" | "box" | "appliance" | "closet" | "countertop" | "other";

export interface AIPhotoSuggestion {
  id: string;
  label: string;
  type: AISuggestionType;
  xPercent: number;
  yPercent: number;
  confidence: number;
  visibleItems: string[];
  notes: string;
}

export interface AIPhotoAnalysis {
  photoType: AIPhotoType;
  summary: string;
  suggestions: AIPhotoSuggestion[];
}
