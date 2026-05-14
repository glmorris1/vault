import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell.jsx";
import { Onboarding } from "./pages/Onboarding.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { LocationPage } from "./pages/LocationPage.jsx";
import { ImageDetailPage } from "./pages/ImageDetailPage.jsx";
import { PinDetailPage } from "./pages/PinDetailPage.jsx";
import { hasSeenOnboarding, loadVault, saveVault, setSeenOnboarding } from "./data/storage.js";

export default function App() {
  const [data, setData] = useState(loadVault);
  const [onboarded, setOnboarded] = useState(hasSeenOnboarding);

  useEffect(() => saveVault(data), [data]);

  function updateData(updater) {
    setData((current) => (typeof updater === "function" ? updater(current) : updater));
  }

  function finishOnboarding() {
    setSeenOnboarding();
    setOnboarded(true);
  }

  if (!onboarded) {
    return <Onboarding onFinish={finishOnboarding} />;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AppShell title="Vault" subtitle="Home Organization & Inventory" data={data} onImport={updateData}>
            <Dashboard data={data} updateData={updateData} />
          </AppShell>
        }
      />
      <Route
        path="/locations/:locationId"
        element={
          <AppShell title="Location" subtitle="Photos, areas, and storage zones" showBack>
            <LocationPage data={data} updateData={updateData} />
          </AppShell>
        }
      />
      <Route
        path="/locations/:locationId/images/:imageId"
        element={
          <AppShell title="Image" subtitle="Tap the photo to add a pin" showBack>
            <ImageDetailPage data={data} updateData={updateData} />
          </AppShell>
        }
      />
      <Route
        path="/locations/:locationId/images/:imageId/pins/:pinId"
        element={
          <AppShell title="Pin Details" subtitle="Stored items and notes" showBack>
            <PinDetailPage data={data} updateData={updateData} />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
