import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, getFirestore, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadString } from "firebase/storage";
import { createStarterData } from "../data/storage.js";

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
    services = {
      auth: getAuth(app),
      db: getFirestore(app),
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
  return onAuthStateChanged(activeServices.auth, callback);
}

export async function registerUser({ username, email, password }) {
  const { auth, db } = getServices();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: username });
  await setDoc(doc(db, "users", credential.user.uid), {
    username,
    email,
    createdAt: serverTimestamp(),
  });
  return credential.user;
}

export async function loginUser({ email, password }) {
  const { auth } = getServices();
  const credential = await signInWithEmailAndPassword(auth, email, password);
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
        onData(snapshot.data().data || createStarterData());
        return;
      }

      const starterData = createStarterData();
      await setDoc(vaultRef, { data: starterData, updatedAt: serverTimestamp() });
      onData(starterData);
    },
    onError,
  );
}

export async function saveVaultToCloud(userId, data) {
  const { db } = getServices();
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

export async function loadExistingVault(userId) {
  const { db } = getServices();
  const snapshot = await getDoc(doc(db, "vaults", userId));
  return snapshot.exists() ? snapshot.data().data : createStarterData();
}
