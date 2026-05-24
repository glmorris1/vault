const SHARE_BASE_URL = "https://glmorris1.github.io/vault/";

export function createShareUrl(locations) {
  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    locations: (locations || []).map(prepareSharedLocation),
  };
  return `${SHARE_BASE_URL}?share=${encodePayload(payload)}`;
}

export function readSharePayload() {
  const searchData = new URLSearchParams(window.location.search).get("share");
  if (searchData) return decodePayload(searchData);

  const hash = window.location.hash.replace(/^#/, "");
  const query = hash.startsWith("share&") ? hash.slice("share&".length) : hash;
  const params = new URLSearchParams(query);
  const data = params.get("data");
  if (!data) return null;
  return decodePayload(data);
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
    pins: (image.pins || []).map((pin) => ({
      id: pin.id,
      label: pin.label,
      note: pin.note,
      items: (pin.items || []).map((item) => ({
        id: item.id,
        name: item.name,
        note: item.note,
      })),
    })),
  };
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
