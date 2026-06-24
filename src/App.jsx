import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Fingerprint } from "lucide-react";
import { AppShell } from "./components/AppShell.jsx";
import { Button } from "./components/Button.jsx";
import { Onboarding } from "./pages/Onboarding.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { LocationPage } from "./pages/LocationPage.jsx";
import { ImageDetailPage } from "./pages/ImageDetailPage.jsx";
import { PinDetailPage } from "./pages/PinDetailPage.jsx";
import { UpgradePage } from "./pages/UpgradePage.jsx";
import { SharedVaultPage } from "./pages/SharedVaultPage.jsx";
import { createStarterData, hasSeenOnboarding, loadVault, saveVault, setSeenOnboarding } from "./data/storage.js";
import { findLocation } from "./data/search.js";
import { isBiometricSessionUnlocked, isBiometricUnlockEnabled, unlockWithBiometrics } from "./services/authPreferences.js";
import { deleteCurrentAccount, isFirebaseConfigured, logoutUser, saveVaultToCloud, subscribeToAuth, subscribeToVault } from "./services/firebase.js";
import { clearPendingSharePayload, cloneSharedLocations, getPendingSharePayload } from "./services/shareLinks.js";

const vaultLogo = "./vault-icon.png";

const THEME_STORAGE_KEY = "vault-theme";

export default function App() {
  const [data, setData] = useState(loadVault);
  const [onboarded, setOnboarded] = useState(hasSeenOnboarding);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [vaultReady, setVaultReady] = useState(!isFirebaseConfigured);
  const [cloudError, setCloudError] = useState("");
  const [biometricUnlocked, setBiometricUnlocked] = useState(false);
  const [theme, setTheme] = useState(() => window.localStorage.getItem(THEME_STORAGE_KEY) || "default");
  const routerLocation = useLocation();
  const saveTimerRef = useRef(null);
  const lastCloudJsonRef = useRef("");
  const pendingShareImportRef = useRef(false);

  useEffect(() => saveVault(data), [data]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const authFallbackTimer = window.setTimeout(() => {
      setAuthReady(true);
      setVaultReady(true);
    }, 5000);
    const unsubscribe = subscribeToAuth((nextUser) => {
      window.clearTimeout(authFallbackTimer);
      setUser(nextUser);
      setBiometricUnlocked(false);
      setAuthReady(true);
      setVaultReady(!nextUser);
      setCloudError("");
      if (!nextUser) setData(createStarterData());
    });
    return () => {
      window.clearTimeout(authFallbackTimer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) return undefined;
    setVaultReady(false);
    return subscribeToVault(
      user.uid,
      (cloudData) => {
        lastCloudJsonRef.current = JSON.stringify(cloudData);
        setData(cloudData);
        setVaultReady(true);
      },
      (error) => {
        console.error("Vault cloud sync failed", error);
        setCloudError(formatCloudError(error, "Cloud sync is blocked."));
        setVaultReady(true);
      },
    );
  }, [user]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !vaultReady) return undefined;
    const nextJson = JSON.stringify(data);
    if (nextJson === lastCloudJsonRef.current) return undefined;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveVaultToCloud(user.uid, data)
        .then(() => {
          lastCloudJsonRef.current = nextJson;
          setCloudError("");
        })
        .catch((error) => {
          console.error("Vault cloud save failed", error);
          setCloudError(formatCloudError(error, "Cloud save is blocked."));
        });
    }, 500);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [data, user, vaultReady]);

  useEffect(() => {
    if (!user?.uid) {
      pendingShareImportRef.current = false;
      return;
    }
    if (!vaultReady || pendingShareImportRef.current) return;
    const pendingPayload = getPendingSharePayload();
    if (!pendingPayload?.locations?.length) return;

    pendingShareImportRef.current = true;
    const importedLocations = cloneSharedLocations(pendingPayload.locations);
    setData((current) => ({
      ...current,
      locations: [...(current.locations || []), ...importedLocations],
    }));
    clearPendingSharePayload();
  }, [user?.uid, vaultReady]);

  function updateData(updater) {
    setData((current) => (typeof updater === "function" ? updater(current) : updater));
  }

  function alphabetizeVault() {
    updateData(alphabetizeVaultData);
  }

  async function handleDeleteAccount(password) {
    await deleteCurrentAccount(password);
    setData(createStarterData());
    setVaultReady(false);
  }

  function finishOnboarding() {
    setSeenOnboarding();
    setOnboarded(true);
  }

  const shareParams = new URLSearchParams(routerLocation.search);
  const hasShareLink = shareParams.has("share") || shareParams.has("shareId");
  const isPasswordResetLink = routerLocation.pathname.startsWith("/reset-password") || (shareParams.get("mode") === "resetPassword" && shareParams.has("oobCode"));

  if (hasShareLink || window.location.hash.startsWith("#share") || routerLocation.pathname.startsWith("/share")) {
    return (
      <Routes>
        <Route path="/" element={<SharedVaultPage />} />
        <Route path="/share" element={<SharedVaultPage />} />
        <Route path="*" element={<SharedVaultPage />} />
      </Routes>
    );
  }

  if (isPasswordResetLink) {
    return (
      <Routes>
        <Route path="/" element={<ResetPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<ResetPasswordPage />} />
      </Routes>
    );
  }

  if (!authReady) {
    return <VaultLoadingScreen message="Opening Vault..." />;
  }

  if (!user) {
    return <LoginPage />;
  }

  const needsBiometricUnlock = isBiometricUnlockEnabled(user.uid) && !isBiometricSessionUnlocked(user.uid) && !biometricUnlocked;
  if (needsBiometricUnlock) {
    return (
      <BiometricUnlockPage
        user={user}
        onUnlock={() => setBiometricUnlocked(true)}
        onLogout={logoutUser}
      />
    );
  }

  if (!onboarded) {
    return <Onboarding onFinish={finishOnboarding} />;
  }

  if (!vaultReady) {
    return <VaultLoadingScreen message="Loading your Vault..." />;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AppShell title="Vault" user={user} onLogout={logoutUser} onDeleteAccount={handleDeleteAccount} cloudError={cloudError} theme={theme} onThemeChange={setTheme} onAlphabetize={alphabetizeVault} data={data}>
            <Dashboard data={data} updateData={updateData} />
          </AppShell>
        }
      />
      <Route
        path="/locations/:locationId"
        element={
          <LocationRoute
            data={data}
            updateData={updateData}
            user={user}
            cloudError={cloudError}
            theme={theme}
            onThemeChange={setTheme}
            onAlphabetize={alphabetizeVault}
            onDeleteAccount={handleDeleteAccount}
          />
        }
      />
      <Route
        path="/locations/:locationId/images/:imageId"
        element={
          <AppShell title="Image" subtitle="Tap the photo to add a pin" showBack user={user} onLogout={logoutUser} onDeleteAccount={handleDeleteAccount} cloudError={cloudError} theme={theme} onThemeChange={setTheme} onAlphabetize={alphabetizeVault} data={data}>
            <ImageDetailPage data={data} updateData={updateData} />
          </AppShell>
        }
      />
      <Route
        path="/locations/:locationId/images/:imageId/pins/:pinId"
        element={
          <AppShell title="Pin Details" subtitle="Stored items and notes" showBack user={user} onLogout={logoutUser} onDeleteAccount={handleDeleteAccount} cloudError={cloudError} theme={theme} onThemeChange={setTheme} onAlphabetize={alphabetizeVault} data={data}>
            <PinDetailPage data={data} updateData={updateData} userId={user.uid} />
          </AppShell>
        }
      />
      <Route
        path="/upgrade"
        element={
          <AppShell title="Upgrade" showBack user={user} onLogout={logoutUser} onDeleteAccount={handleDeleteAccount} cloudError={cloudError} theme={theme} onThemeChange={setTheme} onAlphabetize={alphabetizeVault} data={data}>
            <UpgradePage />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function VaultLoadingScreen({ message }) {
  return (
    <main className="safe-bottom grid min-h-svh place-items-center bg-gradient-to-b from-pink-50 via-white to-pink-50 px-6 text-center">
      <div>
        <div className="mx-auto size-20 overflow-hidden rounded-[2rem] bg-white shadow-soft">
          <img className="size-20 object-cover" src={vaultLogo} alt="" />
        </div>
        <h1 className="gold-4 mt-6 text-4xl font-black tracking-[0.16em]">Vault</h1>
        <p className="mt-3 text-base font-black text-vault-muted">{message}</p>
      </div>
    </main>
  );
}

function BiometricUnlockPage({ user, onUnlock, onLogout }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleUnlock() {
    setStatus("");
    setBusy(true);
    try {
      await unlockWithBiometrics(user.uid);
      onUnlock();
    } catch (error) {
      setStatus(error?.message || "Vault could not verify Face ID. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="safe-bottom mx-auto grid min-h-svh w-full max-w-xl place-items-center px-4 py-8 sm:px-6">
      <div className="w-full rounded-[2rem] bg-white p-6 text-center shadow-soft">
        <div className="mx-auto mb-4 size-16 overflow-hidden rounded-[1.75rem] bg-white shadow-soft">
          <img className="size-16 object-cover" src={vaultLogo} alt="" />
        </div>
        <h1 className="gold-4 text-4xl font-black">Vault</h1>
        <p className="mt-2 text-base font-semibold text-vault-muted">Use Face ID or your device passcode to unlock Vault.</p>
        {status && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{status}</p>}
        <Button className="mt-5 w-full gap-2" onClick={handleUnlock} disabled={busy}>
          <Fingerprint size={18} />
          {busy ? "Checking..." : "Unlock with Face ID"}
        </Button>
        <button className="mt-4 text-sm font-black text-vault-muted underline" onClick={onLogout} type="button">
          Use a different login
        </button>
      </div>
    </main>
  );
}

function LocationRoute({ data, updateData, user, cloudError, theme, onThemeChange, onAlphabetize, onDeleteAccount }) {
  const { locationId } = useParams();
  const location = findLocation(data, locationId);

  return (
    <AppShell title={location?.name || "Location"} showBack user={user} onLogout={logoutUser} onDeleteAccount={onDeleteAccount} cloudError={cloudError} theme={theme} onThemeChange={onThemeChange} onAlphabetize={onAlphabetize} data={data}>
      <LocationPage data={data} updateData={updateData} userId={user.uid} />
    </AppShell>
  );
}

function alphabetizeVaultData(current) {
  return {
    ...current,
    locations: [...(current.locations || [])].map(alphabetizeLocation).sort(compareByName),
  };
}

function alphabetizeLocation(location) {
  return {
    ...location,
    images: [...(location.images || [])].map(alphabetizeImage).sort(compareByName),
    rooms: [...(location.rooms || [])].map(alphabetizeRoom).sort(compareByName),
  };
}

function alphabetizeRoom(room) {
  return {
    ...room,
    images: [...(room.images || [])].map(alphabetizeImage).sort(compareByName),
  };
}

function alphabetizeImage(image) {
  return {
    ...image,
    pins: [...(image.pins || [])].map(alphabetizePin).sort(compareByName),
  };
}

function alphabetizePin(pin) {
  return {
    ...pin,
    photos: [...(pin.photos || [])].sort(compareByName),
    items: [...(pin.items || [])].sort(compareByName),
  };
}

function compareByName(a, b) {
  return itemName(a).localeCompare(itemName(b), undefined, { sensitivity: "base", numeric: true });
}

function itemName(item) {
  return (item?.name || item?.label || "").trim().toLowerCase();
}

function formatCloudError(error, fallback) {
  const message = error?.message || fallback;
  if (message.includes("permission-denied") || message.includes("Missing or insufficient permissions")) {
    return `${fallback} Firebase Firestore rules need to allow this signed-in user to read and write their own Vault.`;
  }
  if (message.includes("unavailable")) {
    return "Cloud sync is temporarily unavailable. Your changes remain on this device until sync works again.";
  }
  return message;
}
