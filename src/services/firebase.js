import { initializeApp } from "firebase/app";
import { Capacitor } from "@capacitor/core";
import {
  createUserWithEmailAndPassword,
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, getFirestore, increment, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadString } from "firebase/storage";
import { createStarterData } from "../data/storage.js";

export const AI_FREE_USE_LIMIT = 100;
export const AI_USAGE_STORAGE_KEY = "vault.aiAssistantUses";

const defaultFirebaseConfig = {
  apiKey: "AIzaSyC4AV1Ge2eT9LKcb3TULzGUuEtv_7Hcw6U",
  authDomain: "vault-4e944.firebaseapp.com",
  projectId: "vault-4e944",
  storageBucket: "vault-4e944.firebasestorage.app",
  messagingSenderId: "858824058807",
  appId: "1:858824058807:web:965475a6995cadea30ea32",
  measurementId: "G-X2E66YHD93",
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || defaultFirebaseConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || defaultFirebaseConfig.measurementId,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId,
);

let services;

function getServices() {
  if (!isFirebaseConfigured) return null;
  if (!services) {
    const app = initializeApp(firebaseConfig);
    const auth = Capacitor.isNativePlatform()
      ? initializeAuth(app, { persistence: inMemoryPersistence })
      : getAuth(app);
    services = {
      auth,
      db: getFirestore(app),
      functions: getFunctions(app),
      storage: getStorage(app),
    };
  }
  return services;
}

export function subscribeToAuth(callback) {
  const activeServices = getServices();
  if (!activeServices) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(activeServices.auth, (nextUser) => {
    if (!nextUser) setStoredAIUses(0);
    callback(nextUser);
  });
}

export async function registerUser({ username, email, password, rememberLogin = true }) {
  const { auth, db } = getServices();
  await setAuthPersistence(auth, rememberLogin);
  const credential = await withTimeout(
    createUserWithEmailAndPassword(auth, email, password),
    20000,
    "Creating your account is taking too long. Please check your connection and try again.",
  );
  await updateProfile(credential.user, { displayName: username });
  await setDoc(doc(db, "users", credential.user.uid), {
    username,
    email,
    createdAt: serverTimestamp(),
  });
  return credential.user;
}

export async function loginUser({ email, password, rememberLogin = true }) {
  const { auth } = getServices();
  await setAuthPersistence(auth, rememberLogin);
  const credential = await withTimeout(
    signInWithEmailAndPassword(auth, email, password),
    20000,
    "Signing in is taking too long. Please check your connection and try again.",
  );
  return credential.user;
}

export async function logoutUser() {
  const { auth } = getServices();
  await signOut(auth);
}

export function subscribeToVault(userId, onData, onError) {
  const { db } = getServices();
  const vaultRef = doc(db, "vaults", userId);
  return onSnapshot(
    vaultRef,
    async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data().data || createStarterData();
        setStoredAIUses(Number(data.aiAssistantUses || 0));
        onData(data);
        return;
      }

      const starterData = createStarterData();
      await setDoc(vaultRef, { data: starterData, updatedAt: serverTimestamp() });
      setStoredAIUses(0);
      onData(starterData);
    },
    onError,
  );
}

export async function saveVaultToCloud(userId, data) {
  const { db } = getServices();
  setStoredAIUses(Number(data.aiAssistantUses || 0));
  await setDoc(doc(db, "vaults", userId), { data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function uploadPhotoForUser(userId, imageId, dataUrl) {
  const { storage } = getServices();
  const storagePath = `users/${userId}/images/${imageId}.jpg`;
  const imageRef = ref(storage, storagePath);
  await uploadString(imageRef, dataUrl, "data_url");
  const downloadUrl = await getDownloadURL(imageRef);
  return { downloadUrl, storagePath };
}

export async function analyzePhotoWithAI({ imageId, storagePath, photoDataUrl, photoWidth, photoHeight }) {
  const { auth, db, functions } = getServices();
  const userId = auth.currentUser?.uid;
  const vaultRef = userId ? doc(db, "vaults", userId) : null;

  if (vaultRef) {
    const snapshot = await getDoc(vaultRef);
    const uses = Number(snapshot.data()?.data?.aiAssistantUses || 0);
    setStoredAIUses(uses);
    if (uses >= AI_FREE_USE_LIMIT) {
      const error = new Error("Upgrade to keep using AI");
      error.code = "resource-exhausted";
      throw error;
    }
  }

  const analyze = httpsCallable(functions, "analyzePhotoWithAI");
  const result = await analyze({
    imageId,
    storagePath,
    downloadUrl: photoDataUrl,
    photoWidth,
    photoHeight,
  });

  if (vaultRef) {
    await updateDoc(vaultRef, {
      "data.aiAssistantUses": increment(1),
      updatedAt: serverTimestamp(),
    });
    setStoredAIUses(Number(window.localStorage.getItem(AI_USAGE_STORAGE_KEY) || 0) + 1);
  }

  return result.data;
}

export async function loadExistingVault(userId) {
  const { db } = getServices();
  const snapshot = await getDoc(doc(db, "vaults", userId));
  return snapshot.exists() ? snapshot.data().data : createStarterData();
}

function setStoredAIUses(uses) {
  const value = Number.isFinite(uses) ? uses : 0;
  window.localStorage.setItem(AI_USAGE_STORAGE_KEY, String(value));
  window.dispatchEvent(new CustomEvent("vault-ai-usage-changed", { detail: { uses: value } }));
}

async function setAuthPersistence(auth, rememberLogin) {
  if (Capacitor.isNativePlatform()) return;
  try {
    await withTimeout(
      setPersistence(auth, rememberLogin ? browserLocalPersistence : browserSessionPersistence),
      3000,
      "Auth persistence timed out.",
    );
  } catch (error) {
    console.warn("Vault auth persistence setup failed; continuing with Firebase default persistence.", error);
  }
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}
