import { Plus, Trash2 } from "lucide-react";
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
          name: file.name.replace(/\.[^/.]+$/, "") || "New Area",
          photoDataUrl,
          storagePath,
          pins: [],
        });
      }

      updateLocation((current) => ({ ...current, images: [...newImages, ...current.images] }));
      if (newImages.length === 1) navigate(`/locations/${location.id}/images/${newImages[0].id}`);
    } catch (error) {
      setUploadError(formatUploadError(error));
    } finally {
      setUploading(false);
    }
  }

  function renameImage(imageId, name) {
    updateLocation((current) => ({
      ...current,
      images: current.images.map((image) => (image.id === imageId ? { ...image, name } : image)),
    }));
  }

  function deleteImage() {
    updateLocation((current) => ({
      ...current,
      images: current.images.filter((image) => image.id !== deleteImageId),
    }));
    setDeleteImageId(null);
  }

  return (
    <div className="grid gap-5 pb-8">
      <Card>
        <p className="text-xs font-black uppercase tracking-wide text-vault-muted">Location</p>
        <EditableText
          value={location.name}
          className="mt-2 w-full text-3xl font-black tracking-tight"
          onSave={(name) => updateLocation((current) => ({ ...current, name }))}
        />
      </Card>

      <Button className="w-full" onClick={() => fileInputRef.current?.click()}>
        <Plus size={22} />
        {uploading ? "Saving photo..." : "Add image or take photo"}
      </Button>
      {uploadError && <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">{uploadError}</p>}
      <input ref={fileInputRef} className="hidden" type="file" accept="image/*" capture="environment" multiple onChange={handleImageUpload} />

      <section className="grid grid-cols-2 gap-3">
        {location.images.length === 0 ? (
          <div className="col-span-2">
            <EmptyState icon="camera" title="No images yet">
              Add a photo of a room, shelf, drawer, cabinet, or storage area.
            </EmptyState>
          </div>
        ) : (
          location.images.map((image) => (
            <Card key={image.id} className="overflow-hidden p-0">
              <Link to={`/locations/${location.id}/images/${image.id}`} className="block">
                <div className="aspect-[4/3] bg-pink-50">
                  <img className="h-full w-full object-cover" src={image.photoDataUrl} alt={image.name} />
                </div>
              </Link>
              <div className="p-3">
                <EditableText
                  value={image.name}
                  className="w-full text-base font-black"
                  inputClassName="text-sm"
                  onSave={(name) => renameImage(image.id, name)}
                />
                <p className="mt-1 text-xs font-medium text-vault-muted">{image.pins.length} pin{image.pins.length === 1 ? "" : "s"}</p>
                <button
                  className="mt-3 inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
                  onClick={() => setDeleteImageId(image.id)}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </Card>
          ))
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
