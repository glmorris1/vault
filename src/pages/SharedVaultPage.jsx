import { CheckCircle, Home, LogIn, MapPin } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/Card.jsx";
import { isFirebaseConfigured, loadExistingVault, saveVaultToCloud, subscribeToAuth } from "../services/firebase.js";
import { cleanSharedText, cloneSharedLocations, createShareAppUrlFromCurrentUrl, getShareAccessMetadata, isSharePayloadExpired, readSharePayload, savePendingSharePayload } from "../services/shareLinks.js";

const vaultLogo = "./vault-icon.png";

export function SharedVaultPage() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [openAppStatus, setOpenAppStatus] = useState("");
  const autoAddStartedRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    readSharePayload()
      .then((result) => {
        if (active) setPayload(result);
      })
      .catch((error) => {
        if (!active) return;
        if (error?.code === "share_link_expired") {
          navigate("/", { replace: true });
          return;
        }
        setPayload(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const authFallback = window.setTimeout(() => {
      setAuthReady(true);
    }, 1500);
    const unsubscribe = subscribeToAuth((nextUser) => {
      window.clearTimeout(authFallback);
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => {
      window.clearTimeout(authFallback);
      unsubscribe?.();
    };
  }, []);

  const locations = payload?.locations || [];
  const shouldAutoAdd = new URLSearchParams(window.location.search).get("autoAdd") === "1";

  useEffect(() => {
    if (!shouldAutoAdd || autoAddStartedRef.current || loading || !payload || !authReady) return;
    autoAddStartedRef.current = true;
    addLocationsToVault();
  }, [shouldAutoAdd, loading, payload, authReady, user]);

  function openInVaultApp() {
    if (Capacitor.isNativePlatform()) {
      addLocationsToVault();
      return;
    }
    setOpenAppStatus("Opening Vault app...");
    window.location.href = createShareAppUrlFromCurrentUrl();
    window.setTimeout(() => {
      setOpenAppStatus("If Vault did not open, you can continue from this webpage.");
    }, 1200);
  }

  async function addLocationsToVault() {
    if (locations.length === 0 || !payload) return;
    if (isSharePayloadExpired(payload)) {
      navigate("/", { replace: true });
      return;
    }
    if (!user) {
      const savedForLogin = savePendingSharePayload(payload);
      if (!savedForLogin) {
        setSaveStatus("Vault could not keep this shared location for sign in. Try opening the link in the Vault app or share fewer photos.");
        return;
      }
      setSaveStatus("Opening Vault sign in...");
      navigate("/login");
      return;
    }
    setSaving(true);
    setSaveStatus("");
    try {
      const current = await loadExistingVault(user.uid);
      const importedLocations = cloneSharedLocations(locations, getShareAccessMetadata(payload));
      await saveVaultToCloud(user.uid, {
        ...current,
        locations: [...(current.locations || []), ...importedLocations],
      });
      setSaveStatus(importedLocations.length === 1 ? "Added this location to your Vault." : `Added ${importedLocations.length} locations to your Vault.`);
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Could not add shared locations to Vault", error);
      setSaveStatus("Vault could not add these locations. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="vault-centered-shell safe-bottom mx-auto min-h-svh w-full px-4 py-8 sm:px-6">
      <header className="mb-6 text-center">
        <div className="mx-auto mb-4 size-16 overflow-hidden rounded-[1.75rem] bg-white shadow-soft">
          <img className="size-16 scale-[1.7] object-cover" src={vaultLogo} alt="" />
        </div>
        <h1 className="gold-4 text-4xl font-black">Vault</h1>
        <p className="mt-1 text-sm font-black tracking-[0.18em] text-vault-ink">Shared Locations</p>
      </header>

      {loading ? (
        <Card className="p-5 text-center">
          <h2 className="text-xl font-black text-vault-ink">Loading shared locations...</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-vault-muted">Vault is opening the selected locations.</p>
        </Card>
      ) : locations.length === 0 ? (
        <Card className="p-5 text-center">
          <h2 className="text-xl font-black text-vault-ink">This share link is empty</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-vault-muted">Ask the Vault owner to send a new link with at least one location selected.</p>
        </Card>
      ) : (
        <section className="grid gap-4">
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-vault-pink text-vault-ink">
                {user ? <CheckCircle size={20} /> : <LogIn size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black text-vault-ink">Add to your Vault</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-vault-muted">
                  Save these shared locations into your own account. If you need to sign in first, Vault will add them automatically after login.
                </p>
                <button
                  className="mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-vault-ink px-5 text-sm font-black text-white shadow-soft transition active:scale-[0.98]"
                  onClick={openInVaultApp}
                  type="button"
                >
                  Open in Vault app
                </button>
                <p className="mt-2 text-xs font-semibold leading-5 text-vault-muted">If this device cannot open the Vault app, continue on this webpage.</p>
                {openAppStatus && <p className="mt-2 rounded-2xl bg-vault-pink/60 p-3 text-sm font-semibold text-vault-muted">{openAppStatus}</p>}
                {!authReady && <p className="mt-2 text-sm font-semibold text-vault-muted">Checking your login...</p>}
                {saveStatus && <p className="mt-2 rounded-2xl bg-vault-pink/60 p-3 text-sm font-semibold text-vault-muted">{saveStatus}</p>}
                <button
                  className="mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-vault-blue px-5 text-sm font-black text-white shadow-soft transition disabled:cursor-not-allowed disabled:bg-vault-muted/45 active:scale-[0.98]"
                  disabled={saving}
                  onClick={addLocationsToVault}
                  type="button"
                >
                  {saving ? "Adding..." : "Add shared locations"}
                </button>
              </div>
            </div>
          </Card>
          {locations.map((location) => (
            <SharedLocation key={location.id || location.name} location={location} />
          ))}
        </section>
      )}
    </main>
  );
}

function SharedLocation({ location }) {
  const standaloneImages = location.images || [];
  const rooms = location.rooms || [];

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-rose-100/80 p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-vault-pink text-vault-ink">
          <Home size={20} />
        </span>
        <h2 className="min-w-0 flex-1 break-words text-2xl font-black text-vault-ink">{location.name || "Shared location"}</h2>
      </div>

      <div className="grid gap-3 p-4">
        {rooms.map((room) => (
          <SharedRoom key={room.id || room.name} room={room} />
        ))}
        {standaloneImages.length > 0 && <SharedRoom room={{ name: "Photos", images: standaloneImages }} />}
      </div>
    </Card>
  );
}

function SharedRoom({ room }) {
  const images = room.images || [];
  return (
    <section className="rounded-2xl bg-vault-pink/45 p-4">
      <h3 className="text-lg font-black text-vault-ink">{room.name || "Room"}</h3>
      {images.length === 0 ? (
        <p className="mt-2 text-sm font-semibold text-vault-muted">No saved items in this room.</p>
      ) : (
        <div className="mt-3 grid gap-3">
          {images.map((image) => (
            <SharedImage key={image.id || image.name} image={image} />
          ))}
        </div>
      )}
    </section>
  );
}

function SharedImage({ image }) {
  const pins = image.pins || [];
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-sm font-black text-vault-ink">{image.name || "Photo"}</p>
      {image.photoDataUrl && (
        <div className="mt-3 overflow-hidden rounded-2xl bg-vault-pink/50">
          <img className="h-auto max-h-72 w-full object-cover" src={image.photoDataUrl} alt={image.name || "Shared location photo"} />
        </div>
      )}
      {pins.length === 0 ? (
        <p className="mt-1 text-xs font-semibold text-vault-muted">No pins listed.</p>
      ) : (
        <div className="mt-2 grid gap-2">
          {pins.map((pin) => (
            <SharedPin key={pin.id || pin.label} pin={pin} />
          ))}
        </div>
      )}
    </div>
  );
}

function SharedPin({ pin }) {
  const items = cleanSharedItems(pin.items || []);
  const photos = (pin.photos || []).map((photo) => ({
    ...photo,
    items: cleanSharedItems(photo.items || []),
  }));
  const pinNotes = cleanSharedText(pin.notes || pin.note);
  return (
    <div className="rounded-xl border border-rose-100 p-3">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 shrink-0 text-vault-muted" size={16} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-black text-vault-ink">{cleanSharedText(pin.name || pin.label) || "Pin"}</p>
          {pinNotes && <p className="mt-1 break-words text-xs font-semibold leading-5 text-vault-muted">{pinNotes}</p>}
          {items.length > 0 && (
            <ul className="mt-2 grid gap-1">
              {items.map((item) => (
                <li key={item.id || item.name} className="break-words text-sm font-semibold text-vault-muted">
                  {item.name}
                  {item.notes ? `: ${item.notes}` : ""}
                </li>
              ))}
            </ul>
          )}
          {photos.length > 0 && (
            <div className="mt-3 grid gap-2">
              {photos.map((photo) => (
                <div key={photo.id || photo.name} className="overflow-hidden rounded-xl bg-vault-pink/50">
                  <img className="h-auto max-h-56 w-full object-cover" src={photo.photoDataUrl} alt={photo.name || pin.name || pin.label || "Shared detail photo"} />
                  {(photo.items || []).length > 0 && (
                    <ul className="grid gap-1 p-3">
                      {(photo.items || []).map((item) => (
                        <li key={item.id || item.name} className="break-words text-sm font-semibold text-vault-muted">
                          {item.name}
                          {item.notes ? `: ${item.notes}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function cleanSharedItems(items) {
  return items
    .map((item) => ({
      ...item,
      name: cleanSharedText(item.name),
      notes: cleanSharedText(item.notes || item.note),
    }))
    .filter((item) => item.name || item.notes);
}
