const STORAGE_KEY = "vault.prototype.v1";
const ONBOARDING_KEY = "vault.prototype.onboarded";

export function createId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createStarterData() {
  return {
    locations: [],
  };
}

export function loadVault() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createStarterData();
    const parsed = JSON.parse(saved);
    if (
      parsed.locations?.length === 1 &&
      parsed.locations[0].name === "Kitchen" &&
      parsed.locations[0].images?.length === 0
    ) {
      return createStarterData();
    }
    return parsed;
  } catch {
    return createStarterData();
  }
}

// Storage is isolated behind this adapter so a future iOS version can swap
// localStorage for SwiftData/Core Data without changing the screen model.
export function saveVault(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function hasSeenOnboarding() {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function setSeenOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, "true");
}

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function downloadBackup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.locations)) {
          throw new Error("Backup must include a locations array.");
        }
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
