import { ArrowDown, ArrowUp, Camera, ChevronDown, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { EditableText } from "../components/EditableText.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { HOUSEHOLD_ITEM_SUGGESTIONS } from "../data/householdItems.js";
import { createId, readImageFile } from "../data/storage.js";
import { findPin } from "../data/search.js";
import { analyzePhotoWithAI, isFirebaseConfigured, uploadPhotoForUser } from "../services/firebase.js";
import { isNativeApp, promptForNativePhoto } from "../services/nativeBridge.js";

const PHOTO_UPLOAD_TIMEOUT = 45000;
const NEW_ITEM_SCROLL_OFFSET = 118;

export function PinDetailPage({ data, updateData, userId }) {
  const { locationId, imageId, pinId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const itemDragRef = useRef(null);
  const itemRowRefs = useRef({});
  const pendingScrollItemRef = useRef("");
  const suppressItemClickRef = useRef(false);
  const [draggingItemId, setDraggingItemId] = useState("");
  const [itemDropIndex, setItemDropIndex] = useState(null);
  const [itemDragPreview, setItemDragPreview] = useState(null);
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

  useEffect(() => {
    if (!pendingScrollItemRef.current) return;
    const itemId = pendingScrollItemRef.current;
    pendingScrollItemRef.current = "";
    window.setTimeout(() => {
      const row = itemRowRefs.current[itemId];
      if (!row) return;
      const targetY = row.getBoundingClientRect().top + window.scrollY - NEW_ITEM_SCROLL_OFFSET;
      window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
    }, 80);
  }, [pin.items.length]);

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
    pendingScrollItemRef.current = itemId;
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

  function reorderItem(itemId, targetIndex) {
    updatePin((current) => {
      const items = [...current.items];
      const from = items.findIndex((item) => item.id === itemId);
      if (from < 0) return current;
      const to = Math.max(0, Math.min(items.length - 1, targetIndex));
      if (from === to) return current;
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      return { ...current, items };
    });
  }

  function startItemPress(event, itemId) {
    const startX = event.clientX;
    const startY = event.clientY;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture?.(pointerId);
    const timer = window.setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const fromIndex = pin.items.findIndex((item) => item.id === itemId);
      const item = pin.items[fromIndex];
      const dropRects = pin.items
        .filter((entry) => entry.id !== itemId)
        .map((entry) => {
          const rowRect = itemRowRefs.current[entry.id]?.getBoundingClientRect();
          return rowRect
            ? {
                id: entry.id,
                top: rowRect.top + window.scrollY,
                bottom: rowRect.bottom + window.scrollY,
                center: rowRect.top + window.scrollY + rowRect.height / 2,
              }
            : null;
        })
        .filter(Boolean);
      itemDragRef.current = {
        id: itemId,
        startX,
        startY,
        active: true,
        target,
        pointerId,
        fromIndex,
        dropIndex: fromIndex,
        dropRects,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      document.body.classList.add("is-reordering");
      setDraggingItemId(itemId);
      setItemDropIndex(fromIndex);
      setItemDragPreview({
        id: itemId,
        label: item?.name?.trim() || "Item name",
        width: rect.width,
        height: rect.height,
        x: rect.left,
        y: rect.top,
      });
      suppressItemClickRef.current = true;
    }, 350);
    itemDragRef.current = { id: itemId, startX, startY, active: false, timer, target, pointerId };
  }

  function dragItem(event, itemId) {
    const drag = itemDragRef.current;
    if (!drag || drag.id !== itemId) return;
    if (!drag.active) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextDropIndex = getDropIndexFromRects(drag.dropRects || [], event.clientY + window.scrollY);
    drag.dropIndex = nextDropIndex;
    setItemDropIndex(nextDropIndex);
    setItemDragPreview((current) =>
      current
        ? {
            ...current,
            x: event.clientX - drag.offsetX,
            y: event.clientY - drag.offsetY,
          }
        : current,
    );
  }

  function endItemPress(event, itemId) {
    const drag = itemDragRef.current;
    if (!drag || drag.id !== itemId) return;
    window.clearTimeout(drag.timer);
    drag.target?.releasePointerCapture?.(drag.pointerId);
    if (drag.active) {
      event.preventDefault();
      reorderItem(itemId, drag.dropIndex ?? drag.fromIndex ?? 0);
      suppressItemClickRef.current = true;
      window.setTimeout(() => {
        suppressItemClickRef.current = false;
      }, 0);
    }
    document.body.classList.remove("is-reordering");
    itemDragRef.current = null;
    setDraggingItemId("");
    setItemDropIndex(null);
    setItemDragPreview(null);
  }

  function deleteItem(itemId) {
    updatePin((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
    }));
    setExpandedItemIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
  }

  function toggleItemExpanded(itemId) {
    if (suppressItemClickRef.current) return;
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

    const photoSources = [];
    for (const file of files) {
      photoSources.push({
        dataUrl: await readImageFile(file),
        name: "",
      });
    }

    await savePinPhotos(photoSources);
  }

  async function savePinPhotos(photoSources) {
    if (photoSources.length === 0) return;
    setUploadingPhoto(true);
    setPhotoUploadError("");
    const newPhotos = [];
    try {
      for (const source of photoSources) {
        const photoId = createId("pinphoto");
        let photoDataUrl = source.dataUrl;
        let storagePath = "";

        if (userId && isFirebaseConfigured) {
          const uploaded = await withTimeout(
            uploadPhotoForUser(userId, photoId, source.dataUrl),
            PHOTO_UPLOAD_TIMEOUT,
            "Photo upload timed out. Check Firebase Storage rules and try again.",
          );
          photoDataUrl = uploaded.downloadUrl;
          storagePath = uploaded.storagePath;
        }

        newPhotos.push({
          id: photoId,
          name: source.name || "",
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

  async function openDetailPhotoPicker() {
    if (!isNativeApp()) {
      fileInputRef.current?.click();
      return;
    }

    setPhotoUploadError("");
    try {
      const dataUrl = await promptForNativePhoto();
      if (dataUrl) await savePinPhotos([{ dataUrl, name: "" }]);
    } catch (error) {
      if (error?.message) setPhotoUploadError(error.message);
    }
  }

  function renamePhoto(photoId, name) {
    updatePin((current) => ({
      ...current,
      photos: (current.photos || []).map((photo) => (photo.id === photoId ? { ...photo, name } : photo)),
    }));
  }

  function movePhoto(photoId, direction) {
    updatePin((current) => {
      const photos = [...(current.photos || [])];
      const from = photos.findIndex((photo) => photo.id === photoId);
      if (from < 0) return current;
      const to = direction === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= photos.length) return current;
      const [photo] = photos.splice(from, 1);
      photos.splice(to, 0, photo);
      return { ...current, photos };
    });
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

  const visibleItems = pin.items;

  return (
    <div className="grid gap-5 pb-28">
      <datalist id="vault-household-items">
        {HOUSEHOLD_ITEM_SUGGESTIONS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-xs font-black uppercase tracking-wide text-vault-muted">{location.name} - {image.name}</p>
          <button className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-700" onClick={() => setDeletePinOpen(true)} aria-label="Delete pin">
            <Trash2 size={18} />
          </button>
        </div>
        <EditableText
          value={pin.name}
          className="mt-2 w-full text-3xl font-black tracking-tight"
          placeholder="Name this pin"
          emptyValues={["New Pin"]}
          onSave={(name) => updatePin((current) => ({ ...current, name }))}
        />
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
          visibleItems.map((item) => {
            const isExpanded = expandedItemIds.has(item.id) && draggingItemId !== item.id;
            const itemName = item.name?.trim() || "Item name";
            return (
            <Card
              key={item.id}
              ref={(node) => {
                itemRowRefs.current[item.id] = node;
              }}
              className={`overflow-hidden p-0 transition ${isExpanded ? "rounded-[1.75rem]" : "rounded-2xl"} ${draggingItemId === item.id ? "opacity-35 ring-2 ring-vault-blue/30" : ""}`}
            >
              <button
                type="button"
                className="drag-reorder-row flex min-h-14 w-full items-center gap-3 px-4 text-left transition active:scale-[0.99]"
                onClick={() => toggleItemExpanded(item.id)}
                onPointerDown={(event) => startItemPress(event, item.id)}
                onPointerMove={(event) => dragItem(event, item.id)}
                onPointerUp={(event) => endItemPress(event, item.id)}
                onPointerCancel={(event) => endItemPress(event, item.id)}
                onContextMenu={(event) => event.preventDefault()}
                onSelectStart={(event) => event.preventDefault()}
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
                <DraftTextInput
                  list="vault-household-items"
                  className="min-h-12 min-w-0 flex-1 rounded-2xl border border-rose-100 bg-white px-4 font-bold outline-none focus:border-vault-rose"
                  value={item.name === "New item" ? "" : item.name}
                  placeholder="Item name"
                  autoCapitalize="words"
                  onCommit={(name) => updateItem(item.id, { name })}
                />
                <button className="grid size-12 place-items-center rounded-2xl bg-red-50 text-red-700" onClick={() => deleteItem(item.id)} aria-label="Delete item">
                  <Trash2 size={18} />
                </button>
              </div>

                  <div className="grid grid-cols-2 gap-2">
                <DraftTextInput
                  className="min-h-11 rounded-2xl border border-rose-100 bg-white px-3 text-sm outline-none focus:border-vault-rose"
                  value={item.quantity || ""}
                  placeholder="Quantity"
                  inputMode="text"
                  autoCapitalize="none"
                  onCommit={(quantity) => updateItem(item.id, { quantity })}
                />
                <DraftTextInput
                  className="min-h-11 rounded-2xl border border-rose-100 bg-white px-3 text-sm outline-none focus:border-vault-rose"
                  value={item.estimatedValue || ""}
                  placeholder="Est. value"
                  inputMode="decimal"
                  autoCapitalize="none"
                  onCommit={(estimatedValue) => updateItem(item.id, { estimatedValue })}
                />
              </div>

                  <DraftTextarea
                className="min-h-20 rounded-2xl border border-rose-100 bg-white px-3 py-3 text-sm outline-none focus:border-vault-rose"
                value={item.notes || ""}
                placeholder="Notes"
                onCommit={(notes) => updateItem(item.id, { notes })}
              />

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
          <Button variant="pin" onClick={openDetailPhotoPicker}>
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
            {(pin.photos || []).map((photo, index, photos) => (
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
                    <Button className="min-h-11 rounded-xl px-3 text-sm" variant="soft" onClick={() => movePhoto(photo.id, "up")} disabled={index === 0}>
                      <ArrowUp size={16} />
                      Up
                    </Button>
                    <Button className="min-h-11 rounded-xl px-3 text-sm" variant="soft" onClick={() => movePhoto(photo.id, "down")} disabled={index === photos.length - 1}>
                      <ArrowDown size={16} />
                      Down
                    </Button>
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
                  <DraftTextInput
                    className="min-h-11 min-w-0 flex-1 rounded-2xl border border-rose-100 bg-white px-4 text-sm font-semibold outline-none focus:border-vault-rose"
                    value={item.name}
                    placeholder="Suggested item"
                    autoCapitalize="words"
                    onCommit={(name) => updateSuggestedItem(item.id, { name })}
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
      {itemDragPreview && (
        <FloatingDragCard preview={itemDragPreview}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-vault-pink text-vault-ink">
            <ChevronRight size={19} />
          </span>
          <span className="min-w-0 flex-1 truncate text-base font-black">{itemDragPreview.label}</span>
        </FloatingDragCard>
      )}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 mx-auto w-full max-w-md px-5 pb-[env(safe-area-inset-bottom)]">
        <Button className="pointer-events-auto w-full shadow-2xl ring-4 ring-white/80" variant="pin" onClick={addItem}>
          <Plus size={20} />
          Add item
        </Button>
      </div>
    </div>
  );
}

function getDropIndexFromRects(rects, pointerY) {
  const targetIndex = rects.findIndex((rect) => pointerY < rect.center);
  return targetIndex === -1 ? rects.length : targetIndex;
}

function FloatingDragCard({ preview, children }) {
  return (
    <div
      className="drag-reorder-row pointer-events-none fixed z-[80] flex items-center gap-3 rounded-2xl border border-white/90 bg-white/95 px-4 text-left text-vault-ink shadow-2xl ring-2 ring-vault-blue/25 backdrop-blur"
      style={{
        left: `${preview.x}px`,
        top: `${preview.y}px`,
        width: `${preview.width}px`,
        minHeight: `${preview.height}px`,
      }}
    >
      {children}
    </div>
  );
}

function DraftTextInput({ value, onCommit, autoCapitalize = "sentences", onKeyDown, ...props }) {
  const [draft, setDraft] = useState(value || "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value || "");
  }, [focused, value]);

  function commit() {
    const nextValue = draft;
    if (nextValue !== (value || "")) onCommit(nextValue);
  }

  return (
    <input
      {...props}
      value={draft}
      autoComplete="on"
      autoCorrect="on"
      autoCapitalize={autoCapitalize}
      spellCheck={true}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit();
        setFocused(false);
        props.onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          event.currentTarget.blur();
        }
        onKeyDown?.(event);
      }}
    />
  );
}

function DraftTextarea({ value, onCommit, onKeyDown, ...props }) {
  const [draft, setDraft] = useState(value || "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value || "");
  }, [focused, value]);

  function commit() {
    const nextValue = draft;
    if (nextValue !== (value || "")) onCommit(nextValue);
  }

  return (
    <textarea
      {...props}
      value={draft}
      autoComplete="on"
      autoCorrect="on"
      autoCapitalize="sentences"
      spellCheck={true}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit();
        setFocused(false);
        props.onBlur?.(event);
      }}
      onKeyDown={onKeyDown}
    />
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
