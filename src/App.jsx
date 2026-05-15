import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "./components/AppShell.jsx";
import { Onboarding } from "./pages/Onboarding.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { LocationPage } from "./pages/LocationPage.jsx";
import { ImageDetailPage } from "./pages/ImageDetailPage.jsx";
import { PinDetailPage } from "./pages/PinDetailPage.jsx";
import { createStarterData, hasSeenOnboarding, loadVault, saveVault, setSeenOnboarding } from "./data/storage.js";
import { findLocation } from "./data/search.js";
import { isFirebaseConfigured, logoutUser, saveVaultToCloud, subscribeToAuth, subscribeToVault } from "./services/firebase.js";

const THEME_STORAGE_KEY = "vault-theme";

export default function App() {
  const [data, setData] = useState(loadVault);
  const [onboarded, setOnboarded] = useState(hasSeenOnboarding);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [vaultReady, setVaultReady] = useState(!isFirebaseConfigured);
  const [cloudError, setCloudError] = useState("");
  const [theme, setTheme] = useState(() => window.localStorage.getItem(THEME_STORAGE_KEY) || "default");
  const saveTimerRef = useRef(null);
  const lastCloudJsonRef = useRef("");

  useEffect(() => saveVault(data), [data]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    return subscribeToAuth((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setVaultReady(!nextUser);
      setCloudError("");
      if (!nextUser) setData(createStarterData());
    });
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

  function updateData(updater) {
    setData((current) => (typeof updater === "function" ? updater(current) : updater));
  }

  function finishOnboarding() {
    setSeenOnboarding();
    setOnboarded(true);
  }

  if (!authReady) {
    return (
      <main className="grid min-h-svh place-items-center px-6 text-center">
        <p className="text-lg font-black text-vault-ink">Opening Vault...</p>
      </main>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!onboarded) {
    return <Onboarding onFinish={finishOnboarding} />;
  }

  if (!vaultReady) {
    return (
      <main className="grid min-h-svh place-items-center px-6 text-center">
        <p className="text-lg font-black text-vault-ink">Loading your Vault...</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AppShell title="Vault" user={user} onLogout={logoutUser} cloudError={cloudError} theme={theme} onThemeChange={setTheme}>
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
          />
        }
      />
      <Route
        path="/locations/:locationId/images/:imageId"
        element={
          <AppShell title="Image" subtitle="Tap the photo to add a pin" showBack user={user} onLogout={logoutUser} cloudError={cloudError} theme={theme} onThemeChange={setTheme}>
            <ImageDetailPage data={data} updateData={updateData} />
          </AppShell>
        }
      />
      <Route
        path="/locations/:locationId/images/:imageId/pins/:pinId"
        element={
          <AppShell title="Pin Details" subtitle="Stored items and notes" showBack user={user} onLogout={logoutUser} cloudError={cloudError} theme={theme} onThemeChange={setTheme}>
            <PinDetailPage data={data} updateData={updateData} userId={user.uid} />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function LocationRoute({ data, updateData, user, cloudError, theme, onThemeChange }) {
  const { locationId } = useParams();
  const location = findLocation(data, locationId);

  return (
    <AppShell title={location?.name || "Location"} showBack user={user} onLogout={logoutUser} cloudError={cloudError} theme={theme} onThemeChange={onThemeChange}>
      <LocationPage data={data} updateData={updateData} userId={user.uid} />
    </AppShell>
  );
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
