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
  const [deleteImageId, setDeleteImageId] = useState(null);
  const [deleteImageRoomId, setDeleteImageRoomId] = useState("");
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
              placeholder="Kitchen, Garage, Bedroom..."
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

      <Button className="hidden" onClick={() => fileInputRef.current?.click()}>
        <Plus size={22} />
        {uploading ? "Saving photo..." : "Add image or take photo"}
      </Button>
      {uploadError && <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">{uploadError}</p>}
      <input ref={fileInputRef} className="hidden" type="file" accept="image/*" capture="environment" multiple onChange={handleImageUpload} />

      <section className="grid gap-3">
        {(location.rooms || []).length === 0 && (location.images || []).length === 0 ? (
          <EmptyState icon="camera" title="No rooms yet">
            Add a room, then add photos inside that room.
          </EmptyState>
        ) : (
          <>
            {(location.rooms || []).map((room) => (
              <RoomSection
                key={room.id}
                room={room}
                locationId={location.id}
                expanded={expandedRoomIds.has(room.id)}
                uploading={uploading && uploadRoomId === room.id}
                onToggle={() => toggleRoom(room.id)}
                onUpload={() => uploadToRoom(room.id)}
                onRenameImage={renameImage}
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
    </div>
  );
}

function RoomSection({ room, locationId, expanded, uploading, legacy = false, onToggle, onUpload, onRenameImage, onDeleteImage }) {
  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        className="flex min-h-14 w-full items-center gap-3 px-4 text-left transition active:scale-[0.99]"
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
