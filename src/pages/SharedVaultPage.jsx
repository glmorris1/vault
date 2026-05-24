import { Home, MapPin } from "lucide-react";
import { useMemo } from "react";
import { Card } from "../components/Card.jsx";
import { readSharePayload } from "../services/shareLinks.js";
import vaultLogo from "../assets/vault-watermark.svg";

export function SharedVaultPage() {
  const payload = useMemo(() => {
    try {
      return readSharePayload();
    } catch {
      return null;
    }
  }, []);
  const locations = payload?.locations || [];

  return (
    <main className="safe-bottom mx-auto min-h-svh w-full max-w-xl px-4 py-8 sm:px-6">
      <header className="mb-6 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-[1.75rem] bg-white shadow-soft">
          <img className="size-12 object-contain" src={vaultLogo} alt="" />
        </div>
        <h1 className="gold-4 text-4xl font-black">Vault</h1>
        <p className="mt-1 text-sm font-black tracking-[0.18em] text-vault-ink">Shared Locations</p>
      </header>

      {locations.length === 0 ? (
        <Card className="p-5 text-center">
          <h2 className="text-xl font-black text-vault-ink">This share link is empty</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-vault-muted">Ask the Vault owner to send a new link with at least one location selected.</p>
        </Card>
      ) : (
        <section className="grid gap-4">
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
  return (
    <div className="rounded-xl border border-rose-100 p-3">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 shrink-0 text-vault-muted" size={16} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-black text-vault-ink">{pin.label || "Pin"}</p>
          {pin.note && <p className="mt-1 break-words text-xs font-semibold leading-5 text-vault-muted">{pin.note}</p>}
          {items.length > 0 && (
            <ul className="mt-2 grid gap-1">
              {items.map((item) => (
                <li key={item.id || item.name} className="break-words text-sm font-semibold text-vault-muted">
                  {item.name}
                  {item.note ? `: ${item.note}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
