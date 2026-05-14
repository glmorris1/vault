import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "./components/AppShell.jsx";
import { Onboarding } from "./pages/Onboarding.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { LocationPage } from "./pages/LocationPage.jsx";
import { ImageDetailPage } from "./pages/ImageDetailPage.jsx";
import { PinDetailPage } from "./pages/PinDetailPage.jsx";
import { createStarterData, hasSeenOnboarding, loadVault, saveVault, setSeenOnboarding } from "./data/storage.js";
import { isFirebaseConfigured, logoutUser, saveVaultToCloud, subscribeToAuth, subscribeToVault } from "./services/firebase.js";

export default function App() {
  const [data, setData] = useState(loadVault);
  const [onboarded, setOnboarded] = useState(hasSeenOnboarding);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [vaultReady, setVaultReady] = useState(!isFirebaseConfigured);
  const saveTimerRef = useRef(null);
  const lastCloudJsonRef = useRef("");

  useEffect(() => saveVault(data), [data]);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    return subscribeToAuth((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setVaultReady(!nextUser);
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
        })
        .catch((error) => console.error("Vault cloud save failed", error));
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
          <AppShell title="Vault" subtitle="Home Organization & Inventory" user={user} onLogout={logoutUser}>
            <Dashboard data={data} updateData={updateData} />
          </AppShell>
        }
      />
      <Route
        path="/locations/:locationId"
        element={
          <AppShell title="Location" subtitle="Photos, areas, and storage zones" showBack user={user} onLogout={logoutUser}>
            <LocationPage data={data} updateData={updateData} userId={user.uid} />
          </AppShell>
        }
      />
      <Route
        path="/locations/:locationId/images/:imageId"
        element={
          <AppShell title="Image" subtitle="Tap the photo to add a pin" showBack user={user} onLogout={logoutUser}>
            <ImageDetailPage data={data} updateData={updateData} />
          </AppShell>
        }
      />
      <Route
        path="/locations/:locationId/images/:imageId/pins/:pinId"
        element={
          <AppShell title="Pin Details" subtitle="Stored items and notes" showBack user={user} onLogout={logoutUser}>
            <PinDetailPage data={data} updateData={updateData} />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
