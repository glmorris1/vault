import { Plus, Search, Trash2, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { EditableText } from "../components/EditableText.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { createId } from "../data/storage.js";
import { searchVault } from "../data/search.js";

export function Dashboard({ data, updateData }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [addingLocation, setAddingLocation] = useState(false);
  const [locationName, setLocationName] = useState("");
  const results = useMemo(() => searchVault(data, query), [data, query]);

  function addLocation(event) {
    event?.preventDefault();
    const name = locationName.trim();
    if (!name) return;
    const location = { id: createId("loc"), name, images: [] };
    updateData((current) => ({ ...current, locations: [location, ...current.locations] }));
    setLocationName("");
    setAddingLocation(false);
    navigate(`/locations/${location.id}`);
  }

  function renameLocation(id, name) {
    updateData((current) => ({
      ...current,
      locations: current.locations.map((location) => (location.id === id ? { ...location, name } : location)),
    }));
  }

  function deleteLocation() {
    updateData((current) => ({
      ...current,
      locations: current.locations.filter((location) => location.id !== deleteId),
    }));
    setDeleteId(null);
  }

  return (
    <div className="pb-24">
      <label className="sticky top-[4.55rem] z-10 mb-5 flex min-h-14 items-center gap-3 rounded-2xl border border-white bg-white/95 px-4 shadow-soft backdrop-blur">
        <Search className="text-vault-muted" size={20} />
        <input
          className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-vault-muted"
          value={query}
          placeholder="Search items, pins, photos, notes..."
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {addingLocation && !query.trim() && (
        <Card className="mb-4 p-4">
          <form className="grid gap-3" onSubmit={addLocation}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">New location</h2>
              <button className="grid size-10 place-items-center rounded-full bg-pink-50 text-vault-muted" type="button" onClick={() => setAddingLocation(false)} aria-label="Cancel new location">
                <X size={18} />
              </button>
            </div>
            <input
              className="min-h-12 rounded-2xl border border-rose-100 bg-white px-4 text-base font-semibold outline-none focus:border-vault-rose"
              value={locationName}
              placeholder="Room, closet, cabinet..."
              autoFocus
              onChange={(event) => setLocationName(event.target.value)}
            />
            <Button className="w-full" type="submit" disabled={!locationName.trim()}>
              Create location
            </Button>
          </form>
        </Card>
      )}

      {query.trim() ? (
        <section className="grid gap-3">
          <p className="px-1 text-sm font-bold text-vault-muted">{results.length} search result{results.length === 1 ? "" : "s"}</p>
          {results.length === 0 ? (
            <EmptyState title="Nothing found">Try a location, photo name, pin label, item, or note.</EmptyState>
          ) : (
            results.map((result) => (
              <Card key={result.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-vault-blue">{result.type}</p>
                    <h2 className="truncate text-lg font-black">{result.title}</h2>
                    <p className="mt-1 truncate text-sm text-vault-muted">{result.path}</p>
                  </div>
                  <Link className="rounded-full bg-vault-blue px-4 py-3 text-sm font-bold text-white" to={result.to}>
                    Open
                  </Link>
                </div>
              </Card>
            ))
          )}
        </section>
      ) : (
        <section className="grid gap-4">
          {data.locations.length === 0 ? (
            <EmptyState title="No locations yet">Add your first room, cabinet, closet, or storage area.</EmptyState>
          ) : (
            data.locations.map((location) => {
              const pinCount = location.images.reduce((total, image) => total + image.pins.length, 0);
              const itemCount = location.images.reduce((total, image) => total + image.pins.reduce((items, pin) => items + pin.items.length, 0), 0);
              return (
                <Card key={location.id} className="p-0">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <EditableText
                          value={location.name}
                          className="w-full text-2xl font-black"
                          inputClassName="text-base"
                          onSave={(name) => renameLocation(location.id, name)}
                        />
                        <p className="mt-1 text-sm text-vault-muted">
                          {location.images.length} image{location.images.length === 1 ? "" : "s"} - {pinCount} pin{pinCount === 1 ? "" : "s"} - {itemCount} item{itemCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <button
                        className="grid size-11 shrink-0 place-items-center rounded-full bg-red-50 text-red-700 transition active:scale-95"
                        onClick={() => setDeleteId(location.id)}
                        aria-label={`Delete ${location.name}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="border-t border-rose-50 p-3">
                    <Button className="min-h-10 w-full rounded-xl px-3 text-sm" onClick={() => navigate(`/locations/${location.id}`)}>
                      Open
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </section>
      )}

      <button
        className="fixed bottom-5 right-5 grid size-16 place-items-center rounded-full bg-vault-ink text-white shadow-2xl shadow-rose-300/60 transition active:scale-95"
        onClick={() => setAddingLocation(true)}
        aria-label="Add location"
      >
        <Plus size={30} />
      </button>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete location?"
        message="This removes the location, photos, pins, and stored items from this browser."
        onCancel={() => setDeleteId(null)}
        onConfirm={deleteLocation}
      />
    </div>
  );
}
