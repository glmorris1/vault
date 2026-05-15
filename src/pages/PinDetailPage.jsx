import { ArrowDown, ArrowUp, Camera, ChevronDown, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useRef, useState } from "react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { EditableText } from "../components/EditableText.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { createId, readImageFile } from "../data/storage.js";
import { findPin } from "../data/search.js";
import { analyzePhotoWithAI, isFirebaseConfigured, uploadPhotoForUser } from "../services/firebase.js";

const PHOTO_UPLOAD_TIMEOUT = 45000;

export function PinDetailPage({ data, updateData, userId }) {
  const { locationId, imageId, pinId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [deleteItemId, setDeleteItemId] = useState(null);
  const [deletePinOpen, setDeletePinOpen] = useState(false);
  const [deletePhotoId, setDeletePhotoId] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [aiPhotoId, setAiPhotoId] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [suggestedItems, setSuggestedItems] = useState([]);
  const [expandedItemIds, setExpandedItemIds] = useState(() => new Set());
  const { location, image, pin } = findPin(data, locationId, imageId, pinId);

  if (!location || !image || !pin) {
    return <EmptyState title="Pin not found">This pin may have been deleted.</EmptyState>;
  }

  function updatePin(updater) {
    updateData((current) => ({
      ...current,
      locations: current.locations.map((loc) =>
        loc.id === location.id
          ? {
              ...loc,
              images: (loc.images || []).map((img) =>
                img.id === image.id
                  ? {
                      ...img,
                      pins: img.pins.map((item) => (item.id === pin.id ? updater(item) : item)),
                    }
                  : img,
              ),
              rooms: (loc.rooms || []).map((room) => ({
                ...room,
                images: (room.images || []).map((img) =>
                  img.id === image.id
                    ? {
                        ...img,
                        pins: img.pins.map((item) => (item.id === pin.id ? updater(item) : item)),
                      }
                    : img,
                ),
              })),
            }
          : loc,
      ),
    }));
  }

  function addItem() {
    const itemId = createId("item");
    updatePin((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id: itemId,
          name: "",
          notes: "",
          quantity: "",
          estimatedValue: "",
        },
      ],
    }));
    setExpandedItemIds((current) => new Set(current).add(itemId));
  }

  function addItems(names) {
    updatePin((current) => ({
      ...current,
      items: [
        ...current.items,
        ...names.map((name) => ({
          id: createId("item"),
          name,
          notes: "",
          quantity: "",
          estimatedValue: "",
        })),
      ],
    }));
  }

  function updateItem(itemId, patch) {
    updatePin((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    }));
  }

  function moveItem(itemId, direction) {
    updatePin((current) => {
      const items = [...current.items];
      const from = items.findIndex((item) => item.id === itemId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= items.length) return current;
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      return { ...current, items };
    });
  }

  function deleteItem() {
    updatePin((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== deleteItemId),
    }));
    setExpandedItemIds((current) => {
      const next = new Set(current);
      next.delete(deleteItemId);
      return next;
    });
    setDeleteItemId(null);
  }

  function toggleItemExpanded(itemId) {
    setExpandedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  async function handlePhotoUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    setUploadingPhoto(true);
    setPhotoUploadError("");
    const newPhotos = [];
    try {
      for (const file of files) {
        const photoId = createId("pinphoto");
        const compressedDataUrl = await readImageFile(file);
        let photoDataUrl = compressedDataUrl;
        let storagePath = "";

        if (userId && isFirebaseConfigured) {
          const uploaded = await withTimeout(
            uploadPhotoForUser(userId, photoId, compressedDataUrl),
            PHOTO_UPLOAD_TIMEOUT,
            "Photo upload timed out. Check Firebase Storage rules and try again.",
          );
          photoDataUrl = uploaded.downloadUrl;
          storagePath = uploaded.storagePath;
        }

        newPhotos.push({
          id: photoId,
          name: "",
          photoDataUrl,
          storagePath,
        });
      }

      updatePin((current) => ({ ...current, photos: [...(current.photos || []), ...newPhotos] }));
    } catch (error) {
      setPhotoUploadError(formatUploadError(error));
    } finally {
      setUploadingPhoto(false);
    }
  }

  function renamePhoto(photoId, name) {
    updatePin((current) => ({
      ...current,
      photos: (current.photos || []).map((photo) => (photo.id === photoId ? { ...photo, name } : photo)),
    }));
  }

  function deletePhoto() {
    updatePin((current) => ({
      ...current,
      photos: (current.photos || []).filter((photo) => photo.id !== deletePhotoId),
    }));
    if (aiPhotoId === deletePhotoId) cancelAISuggestions();
    setDeletePhotoId(null);
  }

  async function requestAISuggestions(photo) {
    setAiPhotoId(photo.id);
    setAiLoading(true);
    setAiError("");
    setAiSummary("");
    setSuggestedItems([]);
    try {
      const analysis = await analyzePhotoWithAI({
        imageId: photo.id,
        storagePath: photo.storagePath,
        photoDataUrl: photo.photoDataUrl,
      });
      const nextItems = collectVisibleItems(analysis);
      setAiSummary(analysis?.summary || "");
      setSuggestedItems(nextItems.map((name) => ({ id: createId("aiitem"), name, selected: true })));
    } catch (error) {
      setAiError(formatAIError(error));
    } finally {
      setAiLoading(false);
    }
  }

  function updateSuggestedItem(id, patch) {
    setSuggestedItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function deleteSuggestedItem(id) {
    setSuggestedItems((current) => current.filter((item) => item.id !== id));
  }

  function acceptSelectedItems() {
    const names = suggestedItems.map((item) => item.name.trim()).filter((name, index, all) => name && all.indexOf(name) === index);
    if (names.length === 0) return;
    addItems(names);
    cancelAISuggestions();
  }

  function cancelAISuggestions() {
    setAiPhotoId("");
    setAiLoading(false);
    setAiError("");
    setAiSummary("");
    setSuggestedItems([]);
  }

  function deletePin() {
    updateData((current) => ({
      ...current,
      locations: current.locations.map((loc) =>
        loc.id === location.id
          ? {
              ...loc,
              images: (loc.images || []).map((img) =>
                img.id === image.id
                  ? {
                      ...img,
                      pins: img.pins.filter((item) => item.id !== pin.id),
                    }
                  : img,
              ),
              rooms: (loc.rooms || []).map((room) => ({
                ...room,
                images: (room.images || []).map((img) =>
                  img.id === image.id
                    ? {
                        ...img,
                        pins: img.pins.filter((item) => item.id !== pin.id),
                      }
                    : img,
                ),
              })),
            }
          : loc,
      ),
    }));
    navigate(`/locations/${location.id}/images/${image.id}`);
  }

  return (
    <div className="grid gap-5 pb-8">
      <Card>
        <p className="text-xs font-black uppercase tracking-wide text-vault-muted">{location.name} - {image.name}</p>
        <EditableText
          value={pin.name}
          className="mt-2 w-full text-3xl font-black tracking-tight"
          placeholder="Name this pin"
          emptyValues={["New Pin"]}
          onSave={(name) => updatePin((current) => ({ ...current, name }))}
        />
        <label className="mt-5 block">
          <span className="text-sm font-bold text-vault-muted">Pin notes</span>
          <textarea
            className="mt-2 min-h-24 w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 outline-none focus:border-vault-rose"
            value={pin.notes || ""}
            placeholder="Optional notes about this storage spot"
            onChange={(event) => updatePin((current) => ({ ...current, notes: event.target.value }))}
          />
        </label>
        <Button className="mt-4 w-full" variant="danger" onClick={() => setDeletePinOpen(true)}>
          <Trash2 size={18} />
          Delete pin
        </Button>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Items</h2>
          <p className="text-sm text-vault-muted">Add, edit, delete, and reorder.</p>
        </div>
        <Button variant="pin" onClick={addItem}>
          <Plus size={20} />
          Add
        </Button>
      </div>

      <section className="grid gap-3">
        {pin.items.length === 0 ? (
          <EmptyState title="No items yet">Add the things stored at this exact pin.</EmptyState>
        ) : (
          pin.items.map((item, index) => {
            const isExpanded = expandedItemIds.has(item.id);
            const itemName = item.name?.trim() || "Item name";
            return (
              <Card key={item.id} className={`overflow-hidden p-0 transition ${isExpanded ? "rounded-[1.75rem]" : "rounded-2xl"}`}>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center gap-3 px-4 text-left transition active:scale-[0.99]"
                  onClick={() => toggleItemExpanded(item.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-vault-pink text-vault-ink">
                    {isExpanded ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-base font-black ${item.name?.trim() ? "text-vault-ink" : "text-vault-muted"}`}>
                    {itemName}
                  </span>
                </button>

                {isExpanded && (
                  <div className="grid gap-3 border-t border-rose-100/70 p-4 pt-3">
                    <div className="flex items-start gap-3">
                      <input
                        className="min-h-12 min-w-0 flex-1 rounded-2xl border border-rose-100 bg-white px-4 font-bold outline-none focus:border-vault-rose"
                        value={item.name === "New item" ? "" : item.name}
                        placeholder="Item name"
                        onChange={(event) => updateItem(item.id, { name: event.target.value })}
                      />
                      <button className="grid size-12 place-items-center rounded-2xl bg-red-50 text-red-700" onClick={() => setDeleteItemId(item.id)} aria-label="Delete item">
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="min-h-11 rounded-2xl border border-rose-100 bg-white px-3 text-sm outline-none focus:border-vault-rose"
                        value={item.quantity || ""}
                        placeholder="Quantity"
                        onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                      />
                      <input
                        className="min-h-11 rounded-2xl border border-rose-100 bg-white px-3 text-sm outline-none focus:border-vault-rose"
                        value={item.estimatedValue || ""}
                        placeholder="Est. value"
                        onChange={(event) => updateItem(item.id, { estimatedValue: event.target.value })}
                      />
                    </div>

                    <textarea
                      className="min-h-20 rounded-2xl border border-rose-100 bg-white px-3 py-3 text-sm outline-none focus:border-vault-rose"
                      value={item.notes || ""}
                      placeholder="Notes"
                      onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                    />

                    <div className="flex gap-2">
                      <Button className="min-h-10 flex-1 rounded-xl px-3 text-sm" variant="secondary" disabled={index === 0} onClick={() => moveItem(item.id, -1)}>
                        <ArrowUp size={16} />
                        Up
                      </Button>
                      <Button className="min-h-10 flex-1 rounded-xl px-3 text-sm" variant="secondary" disabled={index === pin.items.length - 1} onClick={() => moveItem(item.id, 1)}>
                        <ArrowDown size={16} />
                        Down
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Detail photos</h2>
            <p className="text-sm text-vault-muted">Add an open drawer, cabinet, or shelf photo.</p>
          </div>
          <Button variant="pin" onClick={() => fileInputRef.current?.click()}>
            <Camera size={19} />
            Add
          </Button>
        </div>
        <input ref={fileInputRef} className="hidden" type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoUpload} />
        {uploadingPhoto && <p className="rounded-2xl bg-white/75 p-3 text-sm font-bold text-vault-muted">Saving photo...</p>}
        {photoUploadError && <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold leading-6 text-red-700">{photoUploadError}</p>}

        {(pin.photos || []).length === 0 ? (
          <EmptyState icon="camera" title="No detail photos yet">Take a close-up photo of what is inside this storage spot.</EmptyState>
        ) : (
          <div className="grid gap-3">
            {(pin.photos || []).map((photo) => (
              <Card key={photo.id} className="overflow-hidden p-0">
                <div className="aspect-[4/3] bg-pink-50">
                  <img className="h-full w-full object-cover" src={photo.photoDataUrl} alt={photo.name || pin.name || "Detail photo"} />
                </div>
                <div className="grid gap-3 p-3">
                  <EditableText
                    value={photo.name}
                    className="w-full text-base font-black"
                    inputClassName="text-sm"
                    placeholder="Name this detail photo"
                    emptyValues={["image", "New Area"]}
                    onSave={(name) => renamePhoto(photo.id, name)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button className="min-h-11 rounded-xl px-3 text-sm" variant="secondary" onClick={() => requestAISuggestions(photo)} disabled={aiLoading}>
                      <Sparkles size={16} />
                      {aiLoading && aiPhotoId === photo.id ? "Analyzing..." : "Use AI"}
                    </Button>
                    <Button className="min-h-11 rounded-xl px-3 text-sm" variant="danger" onClick={() => setDeletePhotoId(photo.id)}>
                      <Trash2 size={16} />
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {(aiError || aiSummary || suggestedItems.length > 0) && (
        <Card className="grid gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">AI item suggestions</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-vault-muted">Review suggested items before adding them to this pin.</p>
            </div>
            <Sparkles className="shrink-0 text-vault-blue" size={24} />
          </div>
          {aiError && <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold leading-6 text-red-700">{aiError}</p>}
          {aiSummary && <p className="rounded-2xl bg-blue-50 p-3 text-sm font-semibold leading-6 text-vault-ink">{aiSummary}</p>}
          {suggestedItems.length > 0 && (
            <div className="grid gap-2">
              {suggestedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    className="min-h-11 min-w-0 flex-1 rounded-2xl border border-rose-100 bg-white px-4 text-sm font-semibold outline-none focus:border-vault-rose"
                    value={item.name}
                    placeholder="Suggested item"
                    onChange={(event) => updateSuggestedItem(item.id, { name: event.target.value })}
                  />
                  <button className="grid size-11 place-items-center rounded-2xl bg-red-50 text-red-700" onClick={() => deleteSuggestedItem(item.id)} aria-label="Delete suggestion">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button className="min-h-11 rounded-xl px-3 text-sm" variant="pin" onClick={acceptSelectedItems}>
                  Accept all
                </Button>
                <Button className="min-h-11 rounded-xl px-3 text-sm" variant="soft" onClick={cancelAISuggestions}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(deleteItemId)}
        title="Delete item?"
        message="This item will be removed from the pin inventory."
        onCancel={() => setDeleteItemId(null)}
        onConfirm={deleteItem}
      />
      <ConfirmDialog
        open={deletePinOpen}
        title="Delete pin?"
        message="This removes the pin and every item saved at this spot."
        onCancel={() => setDeletePinOpen(false)}
        onConfirm={deletePin}
      />
      <ConfirmDialog
        open={Boolean(deletePhotoId)}
        title="Delete detail photo?"
        message="This removes the close-up photo from this pin."
        onCancel={() => setDeletePhotoId(null)}
        onConfirm={deletePhoto}
      />
    </div>
  );
}

function collectVisibleItems(analysis) {
  const names = [];
  (analysis?.suggestions || []).forEach((suggestion) => {
    (suggestion.visibleItems || []).forEach((item) => names.push(String(item).trim()));
  });
  return names.filter((name, index, all) => name && all.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index);
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function formatUploadError(error) {
  const message = error?.message || "Photo could not be saved.";
  if (message.includes("storage/unauthorized") || message.includes("permission")) {
    return "Photo upload was blocked by Firebase Storage rules. Allow signed-in users to write their own /users/{uid}/images files.";
  }
  if (message.includes("storage/unknown") || message.includes("storage/retry-limit-exceeded")) {
    return "Photo upload could not reach Firebase Storage. Check that Storage is enabled for this Firebase project.";
  }
  return message;
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
