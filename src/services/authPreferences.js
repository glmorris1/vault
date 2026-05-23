const REMEMBER_EMAIL_KEY = "vault.auth.rememberedEmail";
const BIOMETRIC_KEY_PREFIX = "vault.auth.biometric.";
const BIOMETRIC_SESSION_PREFIX = "vault.auth.biometricUnlocked.";

export function getRememberedEmail() {
  return window.localStorage.getItem(REMEMBER_EMAIL_KEY) || "";
}

export function setRememberedEmail(email) {
  const value = String(email || "").trim();
  if (value) {
    window.localStorage.setItem(REMEMBER_EMAIL_KEY, value);
  } else {
    window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
  }
}

export async function canUseBiometricUnlock() {
  if (!window.isSecureContext || !window.PublicKeyCredential) return false;
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isBiometricUnlockEnabled(userId) {
  return Boolean(userId && window.localStorage.getItem(biometricKey(userId)));
}

export function isBiometricSessionUnlocked(userId) {
  return Boolean(userId && window.sessionStorage.getItem(biometricSessionKey(userId)));
}

export function markBiometricSessionUnlocked(userId) {
  if (userId) window.sessionStorage.setItem(biometricSessionKey(userId), "true");
}

export async function enableBiometricUnlock(user) {
  if (!user?.uid) return false;
  const available = await canUseBiometricUnlock();
  if (!available) return false;

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: "Vault" },
      user: {
        id: stringToBuffer(user.uid),
        name: user.email || "Vault user",
        displayName: user.displayName || user.email || "Vault user",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "none",
    },
  });

  if (!credential?.rawId) return false;
  window.localStorage.setItem(biometricKey(user.uid), bufferToBase64Url(credential.rawId));
  markBiometricSessionUnlocked(user.uid);
  return true;
}

export async function unlockWithBiometrics(userId) {
  const credentialId = window.localStorage.getItem(biometricKey(userId));
  if (!credentialId) return false;

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [{ type: "public-key", id: base64UrlToBuffer(credentialId) }],
      userVerification: "required",
      timeout: 60000,
    },
  });

  if (!credential) return false;
  markBiometricSessionUnlocked(userId);
  return true;
}

function biometricKey(userId) {
  return `${BIOMETRIC_KEY_PREFIX}${userId}`;
}

function biometricSessionKey(userId) {
  return `${BIOMETRIC_SESSION_PREFIX}${userId}`;
}

function randomChallenge() {
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  return challenge;
}

function stringToBuffer(value) {
  return new TextEncoder().encode(value);
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBuffer(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
