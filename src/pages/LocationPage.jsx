import { ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useRef, useState } from "react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { EditableText } from "../components/EditableText.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { createId, readImageFile } from "../data/storage.js";
import { findLocation } from "../data/search.js";
import { isFirebaseConfigured, uploadPhotoForUser } from "../services/firebase.js";

const PHOTO_UPLOAD_TIMEOUT = 45000;

export function LocationPage({ data, updateData, userId }) {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const roomDragRef = useRef(null);
  const roomRowRefs = useRef({});
  const suppressRoomClickRef = useRef(false);
  const [deleteImageId, setDeleteImageId] = useState(null);
  const [deleteImageRoomId, setDeleteImageRoomId] = useState("");
  const [deleteRoomId, setDeleteRoomId] = useState(null);
  const [draggingRoomId, setDraggingRoomId] = useState("");
  const [roomDropIndex, setRoomDropIndex] = useState(null);
  const [roomDragPreview, setRoomDragPreview] = useState(null);
  const [addingRoom, setAddingRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [expandedRoomIds, setExpandedRoomIds] = useState(() => new Set());
  const [uploadRoomId, setUploadRoomId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const location = findLocation(data, locationId);

  if (!location) {
    return <EmptyState title="Location not found">This location may have been deleted.</EmptyState>;
  }

  function updateLocation(updater) {
    updateData((current) => ({
      ...current,
      locations: current.locations.map((item) => (item.id === location.id ? updater(item) : item)),
    }));
  }

  async function handleImageUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    setUploadError("");
    const newImages = [];
    try {
      for (const file of files) {
        const imageId = createId("img");
        const compressedDataUrl = await readImageFile(file);
        let photoDataUrl = compressedDataUrl;
        let storagePath = "";

        if (userId && isFirebaseConfigured) {
          const uploaded = await withTimeout(
            uploadPhotoForUser(userId, imageId, compressedDataUrl),
            PHOTO_UPLOAD_TIMEOUT,
            "Photo upload timed out. Check Firebase Storage rules and try again.",
          );
          photoDataUrl = uploaded.downloadUrl;
          storagePath = uploaded.storagePath;
        }

        newImages.push({
          id: imageId,
          name: "",
          photoDataUrl,
          storagePath,
          pins: [],
        });
      }

      updateLocation((current) => {
        if (!uploadRoomId) return { ...current, images: [...newImages, ...(current.images || [])] };
        return {
          ...current,
          rooms: (current.rooms || []).map((room) =>
            room.id === uploadRoomId ? { ...room, images: [...newImages, ...(room.images || [])] } : room,
          ),
        };
      });
      if (newImages.length === 1) navigate(`/locations/${location.id}/images/${newImages[0].id}`);
    } catch (error) {
      setUploadError(formatUploadError(error));
    } finally {
      setUploading(false);
      setUploadRoomId("");
    }
  }

  function addRoom(event) {
    event?.preventDefault();
    const name = roomName.trim();
    if (!name) return;
    const room = { id: createId("room"), name, images: [] };
    updateLocation((current) => ({ ...current, rooms: [...(current.rooms || []), room] }));
    setExpandedRoomIds((current) => new Set(current).add(room.id));
    setRoomName("");
    setAddingRoom(false);
  }

  function toggleRoom(roomId) {
    if (suppressRoomClickRef.current) return;
    setExpandedRoomIds((current) => {
      const next = new Set(current);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  }

  function uploadToRoom(roomId) {
    setUploadRoomId(roomId);
    fileInputRef.current?.click();
  }

  function reorderRoom(roomId, targetIndex) {
    updateLocation((current) => {
      const rooms = [...(current.rooms || [])];
      const from = rooms.findIndex((room) => room.id === roomId);
      if (from < 0) return current;
      const boundedTarget = Math.max(0, Math.min(rooms.length - 1, targetIndex));
      if (from === boundedTarget) return current;
      const [room] = rooms.splice(from, 1);
      rooms.splice(boundedTarget, 0, room);
      return { ...current, rooms };
    });
  }

  function startRoomPress(event, roomId) {
    const startX = event.clientX;
    const startY = event.clientY;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture?.(pointerId);
    const timer = window.setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const currentRooms = location.rooms || [];
      const fromIndex = currentRooms.findIndex((room) => room.id === roomId);
      const room = currentRooms[fromIndex];
      const dropRects = currentRooms
        .filter((item) => item.id !== roomId)
        .map((item) => {
          const rowRect = roomRowRefs.current[item.id]?.getBoundingClientRect();
          return rowRect
            ? {
                id: item.id,
                top: rowRect.top + window.scrollY,
                bottom: rowRect.bottom + window.scrollY,
                center: rowRect.top + window.scrollY + rowRect.height / 2,
              }
            : null;
        })
        .filter(Boolean);
      roomDragRef.current = {
        id: roomId,
        startX,
        startY,
        active: true,
        moved: false,
        target,
        pointerId,
        fromIndex,
        dropIndex: fromIndex,
        dropRects,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      document.body.classList.add("is-reordering");
      setDraggingRoomId(roomId);
      setRoomDropIndex(fromIndex);
      setRoomDragPreview({
        id: roomId,
        label: room?.name || "Room",
        width: rect.width,
        height: rect.height,
        x: event.clientX - (event.clientX - rect.left),
        y: event.clientY - (event.clientY - rect.top),
      });
      suppressRoomClickRef.current = true;
    }, 350);
    roomDragRef.current = { id: roomId, startX, startY, active: false, moved: false, timer, target, pointerId };
  }

  function dragRoom(event, roomId) {
    const drag = roomDragRef.current;
    if (!drag || drag.id !== roomId) return;
    if (!drag.active) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    drag.moved = true;
    const nextDropIndex = getDropIndexFromRects(drag.dropRects || [], event.clientY + window.scrollY);
    drag.dropIndex = nextDropIndex;
    setRoomDropIndex(nextDropIndex);
    setRoomDragPreview((current) =>
      current
        ? {
            ...current,
            x: event.clientX - drag.offsetX,
            y: event.clientY - drag.offsetY,
          }
        : current,
    );
  }

  function endRoomPress(event, roomId) {
    const drag = roomDragRef.current;
    if (!drag || drag.id !== roomId) return;
    window.clearTimeout(drag.timer);
    drag.target?.releasePointerCapture?.(drag.pointerId);
    if (drag.active) {
      event.preventDefault();
      reorderRoom(roomId, drag.dropIndex ?? drag.fromIndex ?? 0);
      suppressRoomClickRef.current = true;
      window.setTimeout(() => {
        suppressRoomClickRef.current = false;
      }, 0);
    }
    document.body.classList.remove("is-reordering");
    roomDragRef.current = null;
    setDraggingRoomId("");
    setRoomDropIndex(null);
    setRoomDragPreview(null);
  }

  function renameImage(imageId, name) {
    updateLocation((current) => ({
      ...current,
      images: (current.images || []).map((image) => (image.id === imageId ? { ...image, name } : image)),
      rooms: (current.rooms || []).map((room) => ({
        ...room,
        images: (room.images || []).map((image) => (image.id === imageId ? { ...image, name } : image)),
      })),
    }));
  }

  function deleteImage() {
    updateLocation((current) => ({
      ...current,
      images: deleteImageRoomId ? current.images || [] : (current.images || []).filter((image) => image.id !== deleteImageId),
      rooms: (current.rooms || []).map((room) =>
        room.id === deleteImageRoomId
          ? { ...room, images: (room.images || []).filter((image) => image.id !== deleteImageId) }
          : room,
      ),
    }));
    setDeleteImageId(null);
    setDeleteImageRoomId("");
  }

  function deleteRoom() {
    updateLocation((current) => ({
      ...current,
      rooms: (current.rooms || []).filter((room) => room.id !== deleteRoomId),
    }));
    setExpandedRoomIds((current) => {
      const next = new Set(current);
      next.delete(deleteRoomId);
      return next;
    });
    setDeleteRoomId(null);
  }

  const visibleRooms = location.rooms || [];

  return (
    <div className="grid gap-5 pb-8">
      {addingRoom ? (
        <Card className="p-4">
          <form className="grid gap-3" onSubmit={addRoom}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">New room</h2>
              <button className="grid size-10 place-items-center rounded-full bg-pink-50 text-vault-muted" type="button" onClick={() => setAddingRoom(false)} aria-label="Cancel new room">
                <X size={18} />
              </button>
            </div>
            <input
              className="min-h-12 rounded-2xl border border-rose-100 bg-white px-4 text-base font-semibold outline-none focus:border-vault-rose"
              value={roomName}
              placeholder="Home office, Bedroom, Garage..."
              autoFocus
              onChange={(event) => setRoomName(event.target.value)}
            />
            <Button className="w-full" type="submit" disabled={!roomName.trim()}>
              Create room
            </Button>
          </form>
        </Card>
      ) : (
        <Button className="w-full" onClick={() => setAddingRoom(true)}>
          <Plus size={22} />
          Add room
        </Button>
      )}

      {uploadError && <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">{uploadError}</p>}
      <input ref={fileInputRef} className="hidden" type="file" accept="image/*" capture="environment" multiple onChange={handleImageUpload} />

      <section className="grid gap-3">
        {(location.rooms || []).length === 0 && (location.images || []).length === 0 ? (
          <EmptyState icon="camera" title="No rooms yet">
            Add a room, then add photos inside that room.
          </EmptyState>
        ) : (
          <>
            {visibleRooms.map((room) => (
              <RoomSection
                key={room.id}
                room={room}
                locationId={location.id}
                expanded={expandedRoomIds.has(room.id) && draggingRoomId !== room.id}
                uploading={uploading && uploadRoomId === room.id}
                onToggle={() => toggleRoom(room.id)}
                onDeleteRoom={() => setDeleteRoomId(room.id)}
                onUpload={() => uploadToRoom(room.id)}
                onRenameImage={renameImage}
                dragProps={{
                  dragging: draggingRoomId === room.id,
                  setRef: (node) => {
                    roomRowRefs.current[room.id] = node;
                  },
                  onPointerDown: (event) => startRoomPress(event, room.id),
                  onPointerMove: (event) => dragRoom(event, room.id),
                  onPointerUp: (event) => endRoomPress(event, room.id),
                  onPointerCancel: (event) => endRoomPress(event, room.id),
                }}
                onDeleteImage={(imageId) => {
                  setDeleteImageRoomId(room.id);
                  setDeleteImageId(imageId);
                }}
              />
            ))}

            {(location.images || []).length > 0 && (
              <RoomSection
                room={{ id: "", name: "Photos", images: location.images || [] }}
                locationId={location.id}
                expanded
                legacy
                onRenameImage={renameImage}
                onDeleteImage={(imageId) => {
                  setDeleteImageRoomId("");
                  setDeleteImageId(imageId);
                }}
              />
            )}
          </>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteImageId)}
        title="Delete image?"
        message="Pins and items attached to this image will also be removed."
        onCancel={() => setDeleteImageId(null)}
        onConfirm={deleteImage}
      />
      <ConfirmDialog
        open={Boolean(deleteRoomId)}
        title="Delete room?"
        message="Photos, pins, and items saved inside this room will also be removed."
        onCancel={() => setDeleteRoomId(null)}
        onConfirm={deleteRoom}
      />
      {roomDragPreview && (
        <FloatingDragCard preview={roomDragPreview}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-vault-pink text-vault-ink">
            <ChevronRight size={19} />
          </span>
          <span className="min-w-0 flex-1 truncate text-lg font-black">{roomDragPreview.label}</span>
        </FloatingDragCard>
      )}
    </div>
  );
}

function RoomSection({ room, locationId, expanded, uploading, legacy = false, onToggle, onDeleteRoom, onUpload, onRenameImage, onDeleteImage, dragProps }) {
  return (
    <Card className={`overflow-hidden p-0 transition ${dragProps?.dragging ? "opacity-35 ring-2 ring-vault-blue/30" : ""}`} ref={dragProps?.setRef}>
      <div
        className="drag-reorder-row flex min-h-14 w-full items-center gap-3 px-4 text-left transition active:scale-[0.99]"
        onPointerDown={legacy ? undefined : dragProps?.onPointerDown}
        onPointerMove={legacy ? undefined : dragProps?.onPointerMove}
        onPointerUp={legacy ? undefined : dragProps?.onPointerUp}
        onPointerCancel={legacy ? undefined : dragProps?.onPointerCancel}
        onContextMenu={legacy ? undefined : (event) => event.preventDefault()}
        onSelectStart={legacy ? undefined : (event) => event.preventDefault()}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
          onClick={legacy ? undefined : onToggle}
          aria-label={legacy ? room.name : expanded ? `Collapse ${room.name}` : `Expand ${room.name}`}
          aria-expanded={expanded}
        >
          {!legacy && (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-vault-pink text-vault-ink">
              {expanded ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-lg font-black">{room.name}</span>
        </button>
        {!legacy && (
          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-700"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDeleteRoom?.();
            }}
            aria-label={`Delete ${room.name}`}
          >
            <Trash2 size={17} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="grid gap-3 border-t border-rose-100/70 p-3">
          {!legacy && (
            <Button className="w-full" onClick={onUpload}>
              <Plus size={20} />
              {uploading ? "Saving photo..." : "Add image or take photo"}
            </Button>
          )}
          {(room.images || []).length === 0 ? (
            <EmptyState icon="camera" title="No images yet">
              Add photos for this room.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(room.images || []).map((image) => (
                <Card key={image.id} className="overflow-hidden p-0">
                  <Link to={`/locations/${locationId}/images/${image.id}`} className="block">
                    <div className="aspect-[4/3] bg-pink-50">
                      <img className="h-full w-full object-cover" src={image.photoDataUrl} alt={image.name} />
                    </div>
                  </Link>
                  <div className="p-3">
                    <EditableText
                      value={image.name}
                      className="w-full text-base font-black"
                      inputClassName="text-sm"
                      placeholder="Name this photo"
                      emptyValues={["New Area", "image"]}
                      onSave={(name) => onRenameImage(image.id, name)}
                    />
                    <p className="mt-1 text-xs font-medium text-vault-muted">{image.pins.length} pin{image.pins.length === 1 ? "" : "s"}</p>
                    <button
                      className="mt-3 inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
                      onClick={() => onDeleteImage(image.id)}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function getDropIndexFromRects(rects, pointerY) {
  const targetIndex = rects.findIndex((rect) => pointerY < rect.center);
  return targetIndex === -1 ? rects.length : targetIndex;
}

function FloatingDragCard({ preview, children }) {
  return (
    <div
      className="drag-reorder-row pointer-events-none fixed z-[80] flex items-center gap-3 rounded-[1.75rem] border border-white/90 bg-white/95 px-4 text-left text-vault-ink shadow-2xl ring-2 ring-vault-blue/25 backdrop-blur"
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
