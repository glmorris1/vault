import { createSharedVaultLink, loadSharedVaultLink } from "./firebase.js";
import { createId } from "../data/storage.js";

const SHARE_BASE_URL = "https://glmorris1.github.io/vault/";
const PENDING_SHARE_PAYLOAD_KEY = "vault.share.pendingPayload";
const BLOCKED_SHARED_TEXT = ["Only include what is visible.", "Do not guess hidden contents."];

export async function createShareUrl(locations) {
  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    locations: (locations || []).map(prepareSharedLocation),
  };
  try {
    const result = await createSharedVaultLink(payload);
    if (result?.url) return result.url;
  } catch (error) {
    console.warn("Vault short share link failed; falling back to embedded link.", error);
  }
  return `${SHARE_BASE_URL}?share=${encodePayload(payload)}`;
}

export async function readSharePayload() {
  const shareId = new URLSearchParams(window.location.search).get("shareId");
  if (shareId) return loadSharedVaultLink(shareId);

  const searchData = new URLSearchParams(window.location.search).get("share");
  if (searchData) return decodePayload(searchData);

  const hash = window.location.hash.replace(/^#/, "");
  const query = hash.startsWith("share&") ? hash.slice("share&".length) : hash;
  const params = new URLSearchParams(query);
  const data = params.get("data");
  if (!data) return null;
  return decodePayload(data);
}

export function savePendingSharePayload(payload) {
  if (!payload) return false;
  const serialized = JSON.stringify(payload);
  try {
    window.localStorage.setItem(PENDING_SHARE_PAYLOAD_KEY, serialized);
    return true;
  } catch {
    try {
      window.sessionStorage.setItem(PENDING_SHARE_PAYLOAD_KEY, serialized);
      return true;
    } catch (error) {
      console.warn("Vault could not keep the shared locations for sign in.", error);
      return false;
    }
  }
}

export function getPendingSharePayload() {
  const raw = window.localStorage.getItem(PENDING_SHARE_PAYLOAD_KEY) || window.sessionStorage.getItem(PENDING_SHARE_PAYLOAD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    clearPendingSharePayload();
    return null;
  }
}

export function clearPendingSharePayload() {
  window.localStorage.removeItem(PENDING_SHARE_PAYLOAD_KEY);
  window.sessionStorage.removeItem(PENDING_SHARE_PAYLOAD_KEY);
}

export function cloneSharedLocations(locations) {
  return (locations || []).map(cloneSharedLocation);
}

function prepareSharedLocation(location) {
  return {
    id: location.id,
    name: location.name,
    rooms: (location.rooms || []).map((room) => ({
      id: room.id,
      name: room.name,
      images: (room.images || []).map(prepareSharedImage),
    })),
    images: (location.images || []).map(prepareSharedImage),
  };
}

function prepareSharedImage(image) {
  return {
    id: image.id,
    name: image.name,
    photoDataUrl: image.photoDataUrl || "",
    storagePath: image.storagePath || "",
    pins: (image.pins || []).map((pin) => ({
      id: pin.id,
      name: cleanSharedText(pin.name || pin.label || ""),
      notes: cleanSharedText(pin.notes || pin.note || ""),
      label: cleanSharedText(pin.label || pin.name || ""),
      note: cleanSharedText(pin.note || pin.notes || ""),
      xPercent: clampPercent(pin.xPercent),
      yPercent: clampPercent(pin.yPercent),
      photos: (pin.photos || []).map((photo) => ({
        id: photo.id,
        name: photo.name,
        photoDataUrl: photo.photoDataUrl || "",
        storagePath: photo.storagePath || "",
        items: (photo.items || []).map((item) => ({
          id: item.id,
          name: cleanSharedText(item.name),
          notes: cleanSharedText(item.notes || item.note || ""),
          note: cleanSharedText(item.note || item.notes || ""),
          quantity: item.quantity || "",
          estimatedValue: item.estimatedValue || "",
        })),
      })),
      items: (pin.items || []).map((item) => ({
        id: item.id,
        name: cleanSharedText(item.name),
        notes: cleanSharedText(item.notes || item.note || ""),
        note: cleanSharedText(item.note || item.notes || ""),
        quantity: item.quantity || "",
        estimatedValue: item.estimatedValue || "",
      })),
    })),
  };
}

function cloneSharedLocation(location) {
  return {
    ...location,
    id: createId("location"),
    rooms: (location.rooms || []).map(cloneSharedRoom),
    images: (location.images || []).map(cloneSharedImage),
  };
}

function cloneSharedRoom(room) {
  return {
    ...room,
    id: createId("room"),
    images: (room.images || []).map(cloneSharedImage),
  };
}

function cloneSharedImage(image) {
  return {
    ...image,
    id: createId("image"),
    pins: (image.pins || []).map(cloneSharedPin),
  };
}

function cloneSharedPin(pin) {
  return {
    ...pin,
    id: createId("pin"),
    name: cleanSharedText(pin.name || pin.label || ""),
    label: cleanSharedText(pin.label || pin.name || ""),
    notes: cleanSharedText(pin.notes || pin.note || ""),
    note: cleanSharedText(pin.note || pin.notes || ""),
    xPercent: clampPercent(pin.xPercent),
    yPercent: clampPercent(pin.yPercent),
    photos: (pin.photos || []).map((photo) => ({
      ...photo,
      id: createId("pinphoto"),
      items: (photo.items || []).map(cloneSharedItem).filter(hasSharedItemContent),
    })),
    items: (pin.items || []).map(cloneSharedItem).filter(hasSharedItemContent),
  };
}

function cloneSharedItem(item) {
  return {
    ...item,
    id: createId("item"),
    name: cleanSharedText(item.name),
    notes: cleanSharedText(item.notes || item.note || ""),
    note: cleanSharedText(item.note || item.notes || ""),
    quantity: item.quantity || "",
    estimatedValue: item.estimatedValue || "",
  };
}

function hasSharedItemContent(item) {
  return Boolean(item.name || item.notes || item.quantity || item.estimatedValue);
}

export function cleanSharedText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return BLOCKED_SHARED_TEXT.reduce((current, phrase) => current.replaceAll(phrase, ""), text).replace(/\s+/g, " ").trim();
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, number));
}

function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
