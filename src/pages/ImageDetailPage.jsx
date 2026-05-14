import { MapPin, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { EditableText } from "../components/EditableText.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { createId } from "../data/storage.js";
import { findImage } from "../data/search.js";

export function ImageDetailPage({ data, updateData }) {
  const { locationId, imageId } = useParams();
  const navigate = useNavigate();
  const [deletePinId, setDeletePinId] = useState(null);
  const { location, image } = findImage(data, locationId, imageId);

  if (!location || !image) {
    return <EmptyState title="Image not found">This image may have been deleted.</EmptyState>;
  }

  function updateImage(updater) {
    updateData((current) => ({
      ...current,
      locations: current.locations.map((loc) =>
        loc.id === location.id
          ? {
              ...loc,
              images: loc.images.map((img) => (img.id === image.id ? updater(img) : img)),
            }
          : loc,
      ),
    }));
  }

  function placePin(event) {
    if (event.target.closest("[data-pin]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // Store pin coordinates as percentages so markers survive responsive image resizing.
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    const pin = {
      id: createId("pin"),
      name: "New Pin",
      xPercent: Math.max(0, Math.min(100, xPercent)),
      yPercent: Math.max(0, Math.min(100, yPercent)),
      notes: "",
      items: [],
    };
    updateImage((current) => ({ ...current, pins: [...current.pins, pin] }));
    navigate(`/locations/${location.id}/images/${image.id}/pins/${pin.id}`);
  }

  function renameImage(name) {
    updateImage((current) => ({ ...current, name }));
  }

  function deletePin() {
    updateImage((current) => ({
      ...current,
      pins: current.pins.filter((pin) => pin.id !== deletePinId),
    }));
    setDeletePinId(null);
  }

  return (
    <div className="grid gap-5 pb-8">
      <Card>
        <p className="text-xs font-black uppercase tracking-wide text-vault-muted">{location.name}</p>
        <EditableText value={image.name} className="mt-2 w-full text-3xl font-black tracking-tight" onSave={renameImage} />
      </Card>

      <div className="relative overflow-hidden rounded-[2rem] bg-white shadow-soft">
        <button className="relative block w-full touch-manipulation" onClick={placePin} aria-label="Add pin to image">
          <img className="block w-full select-none" src={image.photoDataUrl} alt={image.name} draggable="false" />
          {image.pins.map((pin) => (
            <span
              key={pin.id}
              data-pin
              className="pin-pop absolute grid size-11 -translate-x-1/2 -translate-y-full place-items-center text-white drop-shadow-lg"
              style={{ left: `${pin.xPercent}%`, top: `${pin.yPercent}%` }}
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/locations/${location.id}/images/${image.id}/pins/${pin.id}`);
              }}
              aria-label={`Open ${pin.name}`}
              role="button"
            >
              <MapPin className="fill-vault-blue text-vault-blue" size={42} strokeWidth={2.4} />
              <span className="absolute mt-1 text-[0.7rem] font-black">{image.pins.indexOf(pin) + 1}</span>
            </span>
          ))}
        </button>
      </div>

      <p className="rounded-2xl bg-white/70 p-4 text-center text-sm font-semibold leading-6 text-vault-muted">
        Tap anywhere on the image to add a blue pin. Pins stay positioned by percentage, so they scale with the photo.
      </p>

      <section className="grid gap-3">
        {image.pins.length === 0 ? (
          <EmptyState icon="pin" title="No pins yet">Tap the photo where something is stored.</EmptyState>
        ) : (
          image.pins.map((pin) => (
            <Card key={pin.id} className="flex items-center justify-between gap-3 p-4">
              <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/locations/${location.id}/images/${image.id}/pins/${pin.id}`)}>
                <p className="truncate text-lg font-black">{pin.name || "Unnamed pin"}</p>
                <p className="text-sm text-vault-muted">{pin.items.length} item{pin.items.length === 1 ? "" : "s"}</p>
              </button>
              <Button className="min-h-11 rounded-xl px-3" variant="danger" onClick={() => setDeletePinId(pin.id)}>
                <Trash2 size={17} />
              </Button>
            </Card>
          ))
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deletePinId)}
        title="Delete pin?"
        message="Items saved at this pin will also be removed."
        onCancel={() => setDeletePinId(null)}
        onConfirm={deletePin}
      />
    </div>
  );
}
