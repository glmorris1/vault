import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { EditableText } from "../components/EditableText.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { createId } from "../data/storage.js";
import { findPin } from "../data/search.js";

export function PinDetailPage({ data, updateData }) {
  const { locationId, imageId, pinId } = useParams();
  const navigate = useNavigate();
  const [deleteItemId, setDeleteItemId] = useState(null);
  const [deletePinOpen, setDeletePinOpen] = useState(false);
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
              images: loc.images.map((img) =>
                img.id === image.id
                  ? {
                      ...img,
                      pins: img.pins.map((item) => (item.id === pin.id ? updater(item) : item)),
                    }
                  : img,
              ),
            }
          : loc,
      ),
    }));
  }

  function addItem() {
    updatePin((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id: createId("item"),
          name: "New item",
          notes: "",
          quantity: "",
          estimatedValue: "",
        },
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
    setDeleteItemId(null);
  }

  function deletePin() {
    updateData((current) => ({
      ...current,
      locations: current.locations.map((loc) =>
        loc.id === location.id
          ? {
              ...loc,
              images: loc.images.map((img) =>
                img.id === image.id
                  ? {
                      ...img,
                      pins: img.pins.filter((item) => item.id !== pin.id),
                    }
                  : img,
              ),
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
        <EditableText value={pin.name} className="mt-2 w-full text-3xl font-black tracking-tight" onSave={(name) => updatePin((current) => ({ ...current, name }))} />
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
          pin.items.map((item, index) => (
            <Card key={item.id} className="grid gap-3 p-4">
              <div className="flex items-start gap-3">
                <input
                  className="min-h-12 min-w-0 flex-1 rounded-2xl border border-rose-100 bg-white px-4 font-bold outline-none focus:border-vault-rose"
                  value={item.name}
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
            </Card>
          ))
        )}
      </section>

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
    </div>
  );
}
