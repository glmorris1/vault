import { CheckCircle, Home, LogIn, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "../components/Card.jsx";
import { createId } from "../data/storage.js";
import { isFirebaseConfigured, loadExistingVault, saveVaultToCloud, subscribeToAuth } from "../services/firebase.js";
import { readSharePayload } from "../services/shareLinks.js";
import vaultLogo from "../assets/vault-watermark.svg";

export function SharedVaultPage() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    let active = true;
    readSharePayload()
      .then((result) => {
        if (active) setPayload(result);
      })
      .catch(() => {
        if (active) setPayload(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    return subscribeToAuth((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  const locations = payload?.locations || [];

  async function addLocationsToVault() {
    if (!user) {
      setSaveStatus("Sign in to Vault on this device, then reopen this link to add these locations.");
      return;
    }
    if (locations.length === 0) return;
    setSaving(true);
    setSaveStatus("");
    try {
      const current = await loadExistingVault(user.uid);
      const importedLocations = locations.map(cloneSharedLocation);
      await saveVaultToCloud(user.uid, {
        ...current,
        locations: [...(current.locations || []), ...importedLocations],
      });
      setSaveStatus(importedLocations.length === 1 ? "Added this location to your Vault." : `Added ${importedLocations.length} locations to your Vault.`);
    } catch (error) {
      console.error("Could not add shared locations to Vault", error);
      setSaveStatus("Vault could not add these locations. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="safe-bottom mx-auto min-h-svh w-full max-w-xl px-4 py-8 sm:px-6">
      <header className="mb-6 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-[1.75rem] bg-white shadow-soft">
          <img className="size-12 object-contain" src={vaultLogo} alt="" />
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
                  Save these shared locations into your own account so they show up with the rest of your Vault.
                </p>
                {!authReady && <p className="mt-2 text-sm font-semibold text-vault-muted">Checking your login...</p>}
                {authReady && !user && (
                  <p className="mt-2 rounded-2xl bg-vault-pink/60 p-3 text-sm font-semibold text-vault-muted">
                    Sign in to Vault on this device, then reopen this share link to save it.
                  </p>
                )}
                {saveStatus && <p className="mt-2 rounded-2xl bg-vault-pink/60 p-3 text-sm font-semibold text-vault-muted">{saveStatus}</p>}
                <button
                  className="mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-vault-blue px-5 text-sm font-black text-white shadow-soft transition disabled:cursor-not-allowed disabled:bg-vault-muted/45 active:scale-[0.98]"
                  disabled={!authReady || !user || saving}
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

function cloneSharedLocation(location) {
  return {
    ...location,
    id: createId("location"),
    rooms: (location.rooms || []).map(cloneSharedRoom),
    images: (location.images || []).map(cloneSharedImage),
  };
}

function cloneSharedRoom(room) {
  return {
    ...room,
    id: createId("room"),
    images: (room.images || []).map(cloneSharedImage),
  };
}

function cloneSharedImage(image) {
  return {
    ...image,
    id: createId("image"),
    pins: (image.pins || []).map(cloneSharedPin),
  };
}

function cloneSharedPin(pin) {
  return {
    ...pin,
    id: createId("pin"),
    name: pin.name || pin.label || "",
    notes: pin.notes || pin.note || "",
    xPercent: clampPercent(pin.xPercent),
    yPercent: clampPercent(pin.yPercent),
    photos: (pin.photos || []).map((photo) => ({ ...photo, id: createId("pinphoto") })),
    items: (pin.items || []).map((item) => ({
      ...item,
      id: createId("item"),
      notes: item.notes || item.note || "",
      quantity: item.quantity || "",
      estimatedValue: item.estimatedValue || "",
    })),
  };
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, number));
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
  const items = pin.items || [];
  const photos = pin.photos || [];
  return (
    <div className="rounded-xl border border-rose-100 p-3">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 shrink-0 text-vault-muted" size={16} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-black text-vault-ink">{pin.name || pin.label || "Pin"}</p>
          {(pin.notes || pin.note) && <p className="mt-1 break-words text-xs font-semibold leading-5 text-vault-muted">{pin.notes || pin.note}</p>}
          {items.length > 0 && (
            <ul className="mt-2 grid gap-1">
              {items.map((item) => (
                <li key={item.id || item.name} className="break-words text-sm font-semibold text-vault-muted">
                  {item.name}
                  {item.notes || item.note ? `: ${item.notes || item.note}` : ""}
                </li>
              ))}
            </ul>
          )}
          {photos.length > 0 && (
            <div className="mt-3 grid gap-2">
              {photos.map((photo) => (
                <div key={photo.id || photo.name} className="overflow-hidden rounded-xl bg-vault-pink/50">
                  <img className="h-auto max-h-56 w-full object-cover" src={photo.photoDataUrl} alt={photo.name || pin.name || pin.label || "Shared detail photo"} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
