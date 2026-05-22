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

export interface VaultItem {
  id?: string;
  name?: string;
  notes?: string;
  quantity?: string;
  estimatedValue?: string;
}

export interface VaultPin {
  id?: string;
  name?: string;
  notes?: string;
  items?: VaultItem[];
  photos?: Array<{ id?: string; name?: string; storagePath?: string }>;
}

export interface VaultImage {
  id?: string;
  name?: string;
  storagePath?: string;
  pins?: VaultPin[];
}

export interface VaultRoom {
  id?: string;
  name?: string;
  images?: VaultImage[];
}

export interface VaultLocation {
  id?: string;
  name?: string;
  images?: VaultImage[];
  rooms?: VaultRoom[];
}
