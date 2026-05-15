import { Info, Sparkles, Trash2, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useRef, useState } from "react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { EditableText } from "../components/EditableText.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { createId } from "../data/storage.js";
import { findImage } from "../data/search.js";
import { analyzePhotoWithAI } from "../services/firebase.js";

const SUGGESTION_TYPES = ["cabinet", "drawer", "shelf", "bin", "box", "appliance", "closet", "countertop", "other"];

export function ImageDetailPage({ data, updateData }) {
  const { locationId, imageId } = useParams();
  const navigate = useNavigate();
  const [deletePinId, setDeletePinId] = useState(null);
  const [photoSize, setPhotoSize] = useState({ width: 0, height: 0 });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState([]);
  const [showTip, setShowTip] = useState(false);
  const [deleteImageOpen, setDeleteImageOpen] = useState(false);
  const [draggingPinId, setDraggingPinId] = useState("");
  const [draggingPinLabel, setDraggingPinLabel] = useState("");
  const photoFrameRef = useRef(null);
  const draggingPinRef = useRef(null);
  const draggingSuggestionRef = useRef(null);
  const suppressPinClickRef = useRef(false);
  const suppressSuggestionClickRef = useRef(false);
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
              images: (loc.images || []).map((img) => (img.id === image.id ? updater(img) : img)),
              rooms: (loc.rooms || []).map((room) => ({
                ...room,
                images: (room.images || []).map((img) => (img.id === image.id ? updater(img) : img)),
              })),
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
  }

  function pointerPositionToPercent(event) {
    const rect = photoFrameRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      xPercent: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      yPercent: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function startSuggestionDrag(event, suggestionId) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-reordering");
    draggingSuggestionRef.current = { id: suggestionId, startX: event.clientX, startY: event.clientY, moved: false };
  }

  function dragSuggestion(event, suggestionId) {
    const drag = draggingSuggestionRef.current;
    if (!drag || drag.id !== suggestionId) return;
    event.preventDefault();
    event.stopPropagation();
    if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) {
      drag.moved = true;
    }
    const position = pointerPositionToPercent(event);
    if (position) updateSuggestion(suggestionId, position);
  }

  function endSuggestionDrag(event, suggestionId) {
    const drag = draggingSuggestionRef.current;
    if (!drag || drag.id !== suggestionId) return;
    event.preventDefault();
    event.stopPropagation();
    suppressSuggestionClickRef.current = drag.moved;
    document.body.classList.remove("is-reordering");
    draggingSuggestionRef.current = null;
    window.setTimeout(() => {
      suppressSuggestionClickRef.current = false;
    }, 0);
  }

  function updatePinPosition(pinId, position) {
    updateImage((current) => ({
      ...current,
      pins: current.pins.map((pin) => (pin.id === pinId ? { ...pin, ...position } : pin)),
    }));
  }

  function startPinPress(event, pinId) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture?.(pointerId);
    const timer = window.setTimeout(() => {
      draggingPinRef.current = { id: pinId, startX, startY, active: true, moved: false };
      const pin = image.pins.find((item) => item.id === pinId);
      document.body.classList.add("is-reordering");
      setDraggingPinId(pinId);
      setDraggingPinLabel(pin?.name?.trim() || "Unnamed");
    }, 350);
    draggingPinRef.current = { id: pinId, startX, startY, active: false, moved: false, timer, target, pointerId };
  }

  function dragPin(event, pinId) {
    const drag = draggingPinRef.current;
    if (!drag || drag.id !== pinId) return;
    if (!drag.active) {
      if (Math.abs(event.clientX - drag.startX) > 8 || Math.abs(event.clientY - drag.startY) > 8) {
        window.clearTimeout(drag.timer);
        draggingPinRef.current = null;
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    drag.moved = true;
    const position = pointerPositionToPercent(event);
    if (position) updatePinPosition(pinId, position);
  }

  function endPinPress(event, pinId) {
    const drag = draggingPinRef.current;
    if (!drag || drag.id !== pinId) return;
    window.clearTimeout(drag.timer);
    drag.target?.releasePointerCapture?.(drag.pointerId);
    if (drag.active) {
      event.preventDefault();
      event.stopPropagation();
      suppressPinClickRef.current = true;
      const position = pointerPositionToPercent(event);
      if (position) updatePinPosition(pinId, position);
      window.setTimeout(() => {
        suppressPinClickRef.current = false;
      }, 0);
    }
    document.body.classList.remove("is-reordering");
    draggingPinRef.current = null;
    setDraggingPinId("");
    setDraggingPinLabel("");
  }

  function renameImage(name) {
    updateImage((current) => ({ ...current, name }));
  }

  function deleteImage() {
    updateData((current) => ({
      ...current,
      locations: current.locations.map((loc) =>
        loc.id === location.id
          ? {
              ...loc,
              images: (loc.images || []).filter((img) => img.id !== image.id),
              rooms: (loc.rooms || []).map((room) => ({
                ...room,
                images: (room.images || []).filter((img) => img.id !== image.id),
              })),
            }
          : loc,
      ),
    }));
    setDeleteImageOpen(false);
    navigate(`/locations/${location.id}`);
  }

  function deletePin() {
    updateImage((current) => ({
      ...current,
      pins: current.pins.filter((pin) => pin.id !== deletePinId),
    }));
    setDeletePinId(null);
  }

  async function requestAISuggestions() {
    setAiLoading(true);
    setAiError("");
    setSuggestions([]);
    setSelectedSuggestionIds([]);
    try {
      const analysis = await analyzePhotoWithAI({
        imageId: image.id,
        storagePath: image.storagePath,
        photoDataUrl: image.photoDataUrl,
        photoWidth: photoSize.width,
        photoHeight: photoSize.height,
      });
      const nextSuggestions = (analysis?.suggestions || []).map(normalizeSuggestion);
      setAiSummary(analysis?.summary || "");
      setSuggestions(nextSuggestions);
      setSelectedSuggestionIds(nextSuggestions.map((suggestion) => suggestion.id));
    } catch (error) {
      setAiError(formatAIError(error));
    } finally {
      setAiLoading(false);
    }
  }

  function updateSuggestion(id, patch) {
    setSuggestions((current) => current.map((suggestion) => (suggestion.id === id ? { ...suggestion, ...patch } : suggestion)));
  }

  function toggleSuggestion(id) {
    setSelectedSuggestionIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function deleteSuggestion(id) {
    setSuggestions((current) => current.filter((suggestion) => suggestion.id !== id));
    setSelectedSuggestionIds((current) => current.filter((item) => item !== id));
  }

  function acceptSuggestions(ids) {
    const accepted = suggestions.filter((suggestion) => ids.includes(suggestion.id));
    if (accepted.length === 0) return;
    updateImage((current) => ({
      ...current,
      pins: [
        ...current.pins,
        ...accepted.map((suggestion) => ({
          id: createId("pin"),
          name: suggestion.label,
          xPercent: suggestion.xPercent,
          yPercent: suggestion.yPercent,
          notes: suggestion.notes,
          items: suggestion.visibleItems.map((itemName) => ({
            id: createId("item"),
            name: itemName,
            notes: "",
            quantity: "",
            estimatedValue: "",
          })),
        })),
      ],
    }));
    setSuggestions((current) => current.filter((suggestion) => !ids.includes(suggestion.id)));
    setSelectedSuggestionIds((current) => current.filter((id) => !ids.includes(id)));
  }

  function cancelSuggestions() {
    setSuggestions([]);
    setSelectedSuggestionIds([]);
    setAiSummary("");
    setAiError("");
  }

  return (
    <div className="grid gap-5 pb-8">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-wide text-vault-muted">{location.name}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button className="grid size-10 place-items-center rounded-full bg-vault-pink text-vault-ink" onClick={() => setShowTip(true)} aria-label="Show pin tip">
              <Info size={19} />
            </button>
            <button className="grid size-10 place-items-center rounded-full bg-red-50 text-red-700" onClick={() => setDeleteImageOpen(true)} aria-label="Delete image">
              <Trash2 size={18} />
            </button>
          </div>
        </div>
        <EditableText
          value={image.name}
          className="mt-2 w-full text-3xl font-black tracking-tight"
          placeholder="Name this photo"
          emptyValues={["New Area", "image"]}
          onSave={renameImage}
        />
      </Card>

      <div className="relative overflow-hidden rounded-[2rem] bg-white shadow-soft">
        <div
          ref={photoFrameRef}
          className="pin-drag-surface relative block w-full touch-manipulation"
          onClick={placePin}
          onContextMenu={(event) => event.preventDefault()}
          onSelectStart={(event) => event.preventDefault()}
          role="button"
          aria-label="Add pin to image"
        >
          <img
            className="block w-full select-none"
            src={image.photoDataUrl}
            alt={image.name}
            draggable="false"
            onContextMenu={(event) => event.preventDefault()}
            onLoad={(event) => setPhotoSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
          {image.pins.map((pin) => (
            <span
              key={pin.id}
              data-pin
              className="pin-marker-handle pin-pop absolute grid size-10 -translate-x-1/2 -translate-y-full touch-none place-items-center text-white drop-shadow-md"
              style={{ left: `${pin.xPercent}%`, top: `${pin.yPercent}%` }}
              onPointerDown={(event) => startPinPress(event, pin.id)}
              onPointerMove={(event) => dragPin(event, pin.id)}
              onPointerUp={(event) => endPinPress(event, pin.id)}
              onPointerCancel={(event) => endPinPress(event, pin.id)}
              onContextMenu={(event) => event.preventDefault()}
              onSelectStart={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                if (suppressPinClickRef.current) return;
                navigate(`/locations/${location.id}/images/${image.id}/pins/${pin.id}`);
              }}
              aria-label={`Open ${pin.name || "pin"}`}
              role="button"
            >
              {draggingPinId === pin.id && (
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-3 min-w-24 -translate-x-1/2 rounded-full border border-vault-blue/25 bg-white/75 px-3 py-2 text-center text-xs font-black text-vault-ink shadow-lg backdrop-blur-md">
                  {draggingPinLabel}
                  <span className="absolute left-1/2 top-full h-3 w-px -translate-x-1/2 bg-vault-blue/40" />
                </span>
              )}
              <PinMarker />
            </span>
          ))}
          {suggestions.map((suggestion) => (
            <span
              key={suggestion.id}
              data-pin
              className="pin-marker-handle absolute grid size-10 -translate-x-1/2 -translate-y-full touch-none place-items-center"
              style={{ left: `${suggestion.xPercent}%`, top: `${suggestion.yPercent}%` }}
              onPointerDown={(event) => startSuggestionDrag(event, suggestion.id)}
              onPointerMove={(event) => dragSuggestion(event, suggestion.id)}
              onPointerUp={(event) => endSuggestionDrag(event, suggestion.id)}
              onPointerCancel={(event) => endSuggestionDrag(event, suggestion.id)}
              onContextMenu={(event) => event.preventDefault()}
              onSelectStart={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                if (suppressSuggestionClickRef.current) return;
                toggleSuggestion(suggestion.id);
              }}
              aria-label={`Toggle suggested pin ${suggestion.label}`}
              role="button"
            >
              <SuggestedPinMarker selected={selectedSuggestionIds.includes(suggestion.id)} />
            </span>
          ))}
        </div>
      </div>

      <Card className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">AI photo assistant</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-vault-muted">
              AI suggestions may be imperfect. Drag suggested pins to adjust them before saving.
            </p>
          </div>
          <Sparkles className="shrink-0 text-vault-blue" size={24} />
        </div>
        <Button className="w-full" onClick={requestAISuggestions} disabled={aiLoading}>
          <Sparkles size={18} />
          {aiLoading ? "Analyzing photo..." : "Use AI for this photo"}
        </Button>
        {aiError && <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold leading-6 text-red-700">{aiError}</p>}
        {aiSummary && <p className="rounded-2xl bg-blue-50 p-3 text-sm font-semibold leading-6 text-vault-ink">{aiSummary}</p>}
        {suggestions.length > 0 && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Button className="min-h-11 rounded-xl px-3 text-sm" variant="pin" onClick={() => acceptSuggestions(suggestions.map((suggestion) => suggestion.id))}>
                Accept all
              </Button>
              <Button className="min-h-11 rounded-xl px-3 text-sm" variant="secondary" onClick={() => acceptSuggestions(selectedSuggestionIds)}>
                Accept selected
              </Button>
            </div>
            <Button className="min-h-11 rounded-xl px-3 text-sm" variant="soft" onClick={cancelSuggestions}>
              Cancel
            </Button>
          </div>
        )}
      </Card>

      {suggestions.length > 0 && (
        <section className="grid gap-3">
          <h2 className="px-1 text-xl font-black">AI suggestions</h2>
          {suggestions.map((suggestion) => (
            <SuggestionEditor
              key={suggestion.id}
              suggestion={suggestion}
              selected={selectedSuggestionIds.includes(suggestion.id)}
              onToggle={() => toggleSuggestion(suggestion.id)}
              onChange={(patch) => updateSuggestion(suggestion.id, patch)}
              onDelete={() => deleteSuggestion(suggestion.id)}
            />
          ))}
        </section>
      )}

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
      <ConfirmDialog
        open={deleteImageOpen}
        title="Delete image?"
        message={`This will delete this image with ${image.pins.length} pin${image.pins.length === 1 ? "" : "s"} and ${countImageItems(image)} item${countImageItems(image) === 1 ? "" : "s"}.`}
        requireCheckbox
        checkboxLabel="OK to delete this image"
        onCancel={() => setDeleteImageOpen(false)}
        onConfirm={deleteImage}
      />
      {showTip && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-vault-ink/30 p-5 backdrop-blur-sm" onClick={() => setShowTip(false)}>
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold text-vault-ink">Tip</h2>
              <button className="grid size-10 place-items-center rounded-full bg-vault-pink text-vault-ink" onClick={() => setShowTip(false)} aria-label="Close tip">
                <X size={18} />
              </button>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-vault-muted">Tip: Press and hold a pin to drag it to a new location.</p>
            <Button className="mt-5 w-full" variant="secondary" onClick={() => setShowTip(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionEditor({ suggestion, selected, onToggle, onChange, onDelete }) {
  const labelInputRef = useRef(null);
  const visibleItemsText = suggestion.visibleItems.join(", ");

  return (
    <Card className={`grid gap-3 p-4 ${selected ? "ring-2 ring-vault-blue/40" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-black text-vault-ink">
          <input className="size-5 accent-vault-blue" type="checkbox" checked={selected} onChange={onToggle} />
          Selected
        </label>
        <button className="grid size-10 place-items-center rounded-full bg-red-50 text-red-700" onClick={onDelete} aria-label="Delete suggestion">
          <Trash2 size={16} />
        </button>
      </div>
      <Button className="min-h-10 rounded-xl px-3 text-sm" variant="secondary" onClick={() => labelInputRef.current?.focus()}>
        Edit
      </Button>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-vault-muted">Label</span>
        <input
          ref={labelInputRef}
          className="min-h-11 rounded-2xl border border-rose-100 bg-white px-4 font-semibold outline-none focus:border-vault-rose"
          value={suggestion.label}
          placeholder="Storage area label"
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-vault-muted">Type</span>
          <select
            className="min-h-11 rounded-2xl border border-rose-100 bg-white px-3 text-sm font-semibold outline-none focus:border-vault-rose"
            value={suggestion.type}
            onChange={(event) => onChange({ type: event.target.value })}
          >
            {SUGGESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-bold text-vault-muted">Confidence</span>
          <input
            className="min-h-11 rounded-2xl border border-rose-100 bg-white px-3 text-sm outline-none focus:border-vault-rose"
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={suggestion.confidence}
            onChange={(event) => onChange({ confidence: clampNumber(event.target.value, 0, 1) })}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-vault-muted">X %</span>
          <input
            className="min-h-11 rounded-2xl border border-rose-100 bg-white px-3 text-sm outline-none focus:border-vault-rose"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={suggestion.xPercent}
            onChange={(event) => onChange({ xPercent: clampNumber(event.target.value, 0, 100) })}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-bold text-vault-muted">Y %</span>
          <input
            className="min-h-11 rounded-2xl border border-rose-100 bg-white px-3 text-sm outline-none focus:border-vault-rose"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={suggestion.yPercent}
            onChange={(event) => onChange({ yPercent: clampNumber(event.target.value, 0, 100) })}
          />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-vault-muted">Visible items</span>
        <input
          className="min-h-11 rounded-2xl border border-rose-100 bg-white px-4 text-sm outline-none focus:border-vault-rose"
          value={visibleItemsText}
          placeholder="plates, bowls, batteries"
          onChange={(event) => onChange({ visibleItems: splitItems(event.target.value) })}
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-vault-muted">Notes</span>
        <textarea
          className="min-h-20 rounded-2xl border border-rose-100 bg-white px-3 py-3 text-sm outline-none focus:border-vault-rose"
          value={suggestion.notes}
          placeholder="Only include what is visible."
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </label>
    </Card>
  );
}

function PinMarker() {
  return (
    <svg className="h-[46px] w-[37px] overflow-visible drop-shadow-md" viewBox="0 0 84 104" aria-hidden="true">
      <defs>
        <radialGradient id="pinGlow" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#60bdff" />
          <stop offset="58%" stopColor="#0a8cff" />
          <stop offset="100%" stopColor="#0069f4" />
        </radialGradient>
      </defs>
      <path
        d="M42 100C38 91 8 56 8 35C8 15.67 23.67 0 43 0C62.33 0 78 15.67 78 35C78 56 46 91 42 100ZM43 20a15 15 0 1 0 0 30a15 15 0 0 0 0-30Z"
        fill="url(#pinGlow)"
        fillRule="evenodd"
      />
      <path
        d="M42 95C36 82 14 54 14 35C14 19 27 6 43 6C59 6 72 19 72 35C72 54 48 82 42 95ZM43 18a17 17 0 1 0 0 34a17 17 0 0 0 0-34Z"
        fill="#0085ff"
        fillRule="evenodd"
        opacity="0.85"
      />
      <circle cx="43" cy="35" r="18" fill="none" stroke="#005ee8" strokeWidth="4" opacity="0.55" />
    </svg>
  );
}

function SuggestedPinMarker({ selected }) {
  return (
    <svg className="h-[46px] w-[37px] overflow-visible drop-shadow-md" viewBox="0 0 84 104" aria-hidden="true">
      <path
        d="M42 100C38 91 8 56 8 35C8 15.67 23.67 0 43 0C62.33 0 78 15.67 78 35C78 56 46 91 42 100ZM43 20a15 15 0 1 0 0 30a15 15 0 0 0 0-30Z"
        fill={selected ? "#7c3aed" : "#38bdf8"}
        fillRule="evenodd"
        stroke="white"
        strokeWidth="4"
      />
      <circle cx="43" cy="35" r="18" fill="none" stroke={selected ? "#4c1d95" : "#075985"} strokeWidth="4" opacity="0.7" />
    </svg>
  );
}

function normalizeSuggestion(suggestion) {
  return {
    id: suggestion.id || createId("ai"),
    label: suggestion.label || "Suggested pin",
    type: SUGGESTION_TYPES.includes(suggestion.type) ? suggestion.type : "other",
    xPercent: clampNumber(suggestion.xPercent, 0, 100),
    yPercent: clampNumber(suggestion.yPercent, 0, 100),
    confidence: clampNumber(suggestion.confidence, 0, 1),
    visibleItems: Array.isArray(suggestion.visibleItems) ? suggestion.visibleItems.filter(Boolean).map(String) : [],
    notes: suggestion.notes || "Only include what is visible. Do not guess hidden contents.",
  };
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function splitItems(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function countImageItems(image) {
  return (image.pins || []).reduce((total, pin) => total + (pin.items || []).length, 0);
}

function formatAIError(error) {
  const code = error?.code ? String(error.code).replace("functions/", "") : "";
  const message = error?.message || error?.details || "AI analysis failed. Please try again.";
  if (message.includes("unauthenticated")) return "Please sign in before using AI photo analysis.";
  if (message.includes("not-found")) return "This photo could not be found in secure storage.";
  if (message.includes("permission-denied")) return "This photo does not belong to the current signed-in user.";
  if (code === "internal" || message === "internal") {
    return "The AI server returned an internal error. Please check the Firebase Function logs for analyzePhotoWithAI.";
  }
  return message.replace("FirebaseError: ", "");
}
