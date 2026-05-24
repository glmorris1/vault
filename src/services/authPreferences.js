import { Capacitor } from "@capacitor/core";

const REMEMBER_EMAIL_KEY = "vault.auth.rememberedEmail";
const REMEMBER_CREDENTIALS_KEY = "vault.auth.hasSavedCredentials";
const REMEMBER_CREDENTIALS_PROTECTION_KEY = "vault.auth.savedCredentialsProtection";
const BIOMETRIC_KEY_PREFIX = "vault.auth.biometric.";
const BIOMETRIC_SESSION_PREFIX = "vault.auth.biometricUnlocked.";
const NATIVE_CREDENTIAL_SERVER = "vault-login";

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

export async function hasSavedLoginCredentials() {
  if (!isNativeApp()) return false;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    const result = await NativeBiometric.isCredentialsSaved({ server: NATIVE_CREDENTIAL_SERVER });
    return Boolean(result?.isSaved);
  } catch {
    return window.localStorage.getItem(REMEMBER_CREDENTIALS_KEY) === "true";
  }
}

export async function saveLoginCredentials({ user, password, requireBiometric = false }) {
  if (!isNativeApp() || !user?.email || !password) return false;
  try {
    const { AccessControl, NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await NativeBiometric.setCredentials({
      username: user.email,
      password,
      server: NATIVE_CREDENTIAL_SERVER,
      accessControl: requireBiometric ? AccessControl.BIOMETRY_ANY : AccessControl.NONE,
    });
    window.localStorage.setItem(REMEMBER_CREDENTIALS_KEY, "true");
    window.localStorage.setItem(REMEMBER_CREDENTIALS_PROTECTION_KEY, requireBiometric ? "biometric" : "plain");
    if (requireBiometric) {
      window.localStorage.setItem(biometricKey(user.uid), "native");
      markBiometricSessionUnlocked(user.uid);
    }
    return true;
  } catch (error) {
    console.warn("Vault could not save native login credentials.", error);
    return false;
  }
}

export function savedLoginRequiresBiometric() {
  return window.localStorage.getItem(REMEMBER_CREDENTIALS_PROTECTION_KEY) === "biometric";
}

export async function getSavedLoginCredentials({ requireBiometric = false } = {}) {
  if (!isNativeApp()) return null;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    const credentials = requireBiometric
      ? await NativeBiometric.getSecureCredentials({
          server: NATIVE_CREDENTIAL_SERVER,
          reason: "Unlock Vault",
          title: "Vault",
          subtitle: "Face ID",
          description: "Use Face ID or your device passcode to sign in.",
          negativeButtonText: "Cancel",
        })
      : await NativeBiometric.getCredentials({ server: NATIVE_CREDENTIAL_SERVER });
    if (!credentials?.username || !credentials?.password) return null;
    return { email: credentials.username, password: credentials.password };
  } catch {
    return null;
  }
}

export async function clearSavedLoginCredentials() {
  window.localStorage.removeItem(REMEMBER_CREDENTIALS_KEY);
  window.localStorage.removeItem(REMEMBER_CREDENTIALS_PROTECTION_KEY);
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await NativeBiometric.deleteCredentials({ server: NATIVE_CREDENTIAL_SERVER });
  } catch {
    // Nothing to clear.
  }
}

export async function canUseBiometricUnlock() {
  const nativeAvailable = await canUseNativeBiometricUnlock();
  if (nativeAvailable) return true;
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

  const nativeVerified = await verifyNativeBiometricUnlock("Enable Face ID for Vault");
  if (nativeVerified) {
    window.localStorage.setItem(biometricKey(user.uid), "native");
    markBiometricSessionUnlocked(user.uid);
    return true;
  }

  if (!window.PublicKeyCredential) return false;
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

  if (credentialId === "native") {
    const verified = await verifyNativeBiometricUnlock("Unlock Vault");
    if (!verified) return false;
    markBiometricSessionUnlocked(userId);
    return true;
  }

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

async function canUseNativeBiometricUnlock() {
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    const result = await NativeBiometric.isAvailable({ useFallback: true });
    return Boolean(result?.isAvailable);
  } catch {
    return false;
  }
}

function isNativeApp() {
  return Capacitor.isNativePlatform();
}

async function verifyNativeBiometricUnlock(reason) {
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await withTimeout(
      NativeBiometric.verifyIdentity({
        title: "Vault",
        subtitle: "Face ID",
        description: "Use Face ID or your device passcode to continue.",
        reason,
        useFallback: true,
      }),
      8000,
    );
    return true;
  } catch {
    return false;
  }
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("Timed out")), timeoutMs);
    }),
  ]);
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
