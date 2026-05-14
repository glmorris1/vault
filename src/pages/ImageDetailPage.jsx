import { Trash2 } from "lucide-react";
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
      name: "",
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
        <EditableText
          value={image.name}
          className="mt-2 w-full text-3xl font-black tracking-tight"
          placeholder="Name this photo"
          emptyValues={["New Area", "image"]}
          onSave={renameImage}
        />
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
              aria-label={`Open ${pin.name || "pin"}`}
              role="button"
            >
              <PinMarker />
            </span>
          ))}
        </button>
      </div>

      <p className="rounded-2xl bg-white/70 p-4 text-center text-sm font-semibold leading-6 text-vault-muted">
        Tap anywhere on the image to add a marker pin.
      </p>

      <section className="grid gap-3">
        {image.pins.length === 0 ? (
          <EmptyState icon="pin" title="No pins yet">Tap the photo where something is stored.</EmptyState>
        ) : (
          image.pins.map((pin) => (
            <Card key={pin.id} className="flex items-center justify-between gap-3 p-4">
              <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/locations/${location.id}/images/${image.id}/pins/${pin.id}`)}>
                <p className="truncate text-lg font-black">{pin.name || "Name this pin"}</p>
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

function PinMarker() {
  return (
    <svg className="h-[52px] w-[42px] overflow-visible drop-shadow-lg" viewBox="0 0 84 104" aria-hidden="true">
      <defs>
        <radialGradient id="pinGlow" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#60bdff" />
          <stop offset="58%" stopColor="#0a8cff" />
          <stop offset="100%" stopColor="#0069f4" />
        </radialGradient>
        <filter id="blueGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0 0 0 0 0 0.45 0 0 0 0 1 0 0 0 0.8 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M42 100C38 91 8 56 8 35C8 15.67 23.67 0 43 0C62.33 0 78 15.67 78 35C78 56 46 91 42 100ZM43 20a15 15 0 1 0 0 30a15 15 0 0 0 0-30Z"
        fill="url(#pinGlow)"
        fillRule="evenodd"
        filter="url(#blueGlow)"
      />
      <path
        d="M42 95C36 82 14 54 14 35C14 19 27 6 43 6C59 6 72 19 72 35C72 54 48 82 42 95ZM43 18a17 17 0 1 0 0 34a17 17 0 0 0 0-34Z"
        fill="#0085ff"
        fillRule="evenodd"
        opacity="0.85"
      />
      <circle cx="43" cy="35" r="18" fill="none" stroke="#005ee8" strokeWidth="4" opacity="0.55" />
      <circle cx="43" cy="35" r="13" fill="none" stroke="#6bc4ff" strokeWidth="3" opacity="0.5" />
    </svg>
  );
}
