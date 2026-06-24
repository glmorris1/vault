import { ChevronRight, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useMemo, useRef, useState } from "react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { EditableText } from "../components/EditableText.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { createId } from "../data/storage.js";
import { searchVault } from "../data/search.js";

export function Dashboard({ data, updateData }) {
  const navigate = useNavigate();
  const locationDragRef = useRef(null);
  const locationRowRefs = useRef({});
  const suppressLocationClickRef = useRef(false);
  const [query, setQuery] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [addingLocation, setAddingLocation] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [draggingLocationId, setDraggingLocationId] = useState("");
  const [locationDragPreview, setLocationDragPreview] = useState(null);
  const results = useMemo(() => searchVault(data, query), [data, query]);
  const deleteLocationTarget = data.locations.find((location) => location.id === deleteId);
  const deleteSummary = deleteLocationTarget ? summarizeLocation(deleteLocationTarget) : null;

  function addLocation(event) {
    event?.preventDefault();
    const name = locationName.trim();
    if (!name) return;
    const location = { id: createId("loc"), name, images: [] };
    updateData((current) => ({ ...current, locations: [...current.locations, location] }));
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

  function openLocation(locationId) {
    if (suppressLocationClickRef.current) return;
    navigate(`/locations/${locationId}`);
  }

  function reorderLocation(locationId, targetIndex) {
    updateData((current) => {
      const locations = [...current.locations];
      const from = locations.findIndex((location) => location.id === locationId);
      if (from < 0) return current;
      const boundedTarget = Math.max(0, Math.min(locations.length - 1, targetIndex));
      if (from === boundedTarget) return current;
      const [location] = locations.splice(from, 1);
      locations.splice(boundedTarget, 0, location);
      return { ...current, locations };
    });
  }

  function startLocationPress(event, locationId) {
    const startX = event.clientX;
    const startY = event.clientY;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture?.(pointerId);
    const timer = window.setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const currentLocations = data.locations || [];
      const fromIndex = currentLocations.findIndex((location) => location.id === locationId);
      const location = currentLocations[fromIndex];
      const dropRects = currentLocations
        .filter((item) => item.id !== locationId)
        .map((item) => {
          const rowRect = locationRowRefs.current[item.id]?.getBoundingClientRect();
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
      locationDragRef.current = {
        id: locationId,
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
      setDraggingLocationId(locationId);
      setLocationDragPreview({
        id: locationId,
        label: location?.name || "Location",
        width: rect.width,
        height: rect.height,
        x: event.clientX - (event.clientX - rect.left),
        y: event.clientY - (event.clientY - rect.top),
      });
      suppressLocationClickRef.current = true;
    }, 350);
    locationDragRef.current = { id: locationId, startX, startY, active: false, moved: false, timer, target, pointerId };
  }

  function dragLocation(event, locationId) {
    const drag = locationDragRef.current;
    if (!drag || drag.id !== locationId) return;
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
    setLocationDragPreview((current) =>
      current
        ? {
            ...current,
            x: event.clientX - drag.offsetX,
            y: event.clientY - drag.offsetY,
          }
        : current,
    );
  }

  function endLocationPress(event, locationId) {
    const drag = locationDragRef.current;
    if (!drag || drag.id !== locationId) return;
    window.clearTimeout(drag.timer);
    drag.target?.releasePointerCapture?.(drag.pointerId);
    if (drag.active) {
      event.preventDefault();
      reorderLocation(locationId, drag.dropIndex ?? drag.fromIndex ?? 0);
      suppressLocationClickRef.current = true;
      window.setTimeout(() => {
        suppressLocationClickRef.current = false;
      }, 0);
    }
    document.body.classList.remove("is-reordering");
    locationDragRef.current = null;
    setDraggingLocationId("");
    setLocationDragPreview(null);
  }

  return (
    <div className="pb-24">
      <label className="sticky top-[4.55rem] z-10 mb-5 flex min-h-14 items-center gap-3 rounded-2xl border border-white bg-white/95 px-4 shadow-soft backdrop-blur">
        <Search className="text-vault-muted" size={20} />
        <input
          className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-vault-muted"
          value={query}
          placeholder="Search items, pins, photos, notes..."
          autoComplete="on"
          autoCorrect="on"
          autoCapitalize="none"
          spellCheck={true}
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
              placeholder="Home, Office, Storage..."
              autoFocus
              autoComplete="on"
              autoCorrect="on"
              autoCapitalize="words"
              spellCheck={true}
              onChange={(event) => setLocationName(event.target.value)}
            />
            <Button className="w-full" type="submit" disabled={!locationName.trim()}>
              Create location
            </Button>
          </form>
        </Card>
      )}

      {query.trim() ? (
        <section className="grid gap-3 md:grid-cols-2">
          <p className="px-1 text-sm font-bold text-vault-muted md:col-span-2">{results.length} search result{results.length === 1 ? "" : "s"}</p>
          {results.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState title="Nothing found">Try a location, photo name, pin label, item, or note.</EmptyState>
            </div>
          ) : (
            results.map((result) => (
              <Card key={result.id} className="p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <SearchThumbnail result={result} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-wide text-vault-blue">{result.type}</p>
                    <h2 className="break-words text-lg font-black leading-tight">{result.title}</h2>
                    <p className="mt-1 max-w-full whitespace-normal break-words text-sm leading-5 text-vault-muted [overflow-wrap:anywhere]">{result.path}</p>
                  </div>
                  <Link className="shrink-0 rounded-full bg-vault-blue px-4 py-3 text-sm font-bold text-white" to={result.to} state={result.backTo ? { backTo: result.backTo } : undefined}>
                    Open
                  </Link>
                </div>
              </Card>
            ))
          )}
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {data.locations.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState title="No locations yet">Add your first location, Home, Office, Grandma's House, storage area, etc.</EmptyState>
            </div>
          ) : (
            data.locations.map((location) => (
              <Card
                key={location.id}
                className={`cursor-pointer overflow-hidden p-0 transition active:scale-[0.99] ${draggingLocationId === location.id ? "opacity-35 ring-2 ring-vault-blue/30" : ""}`}
                ref={(node) => {
                  if (node) locationRowRefs.current[location.id] = node;
                }}
                onClick={() => openLocation(location.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openLocation(location.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Open ${location.name}`}
              >
                <div className="min-h-20">
                  <div
                    className="drag-reorder-row flex items-center justify-between gap-4 p-5"
                    onPointerDown={(event) => startLocationPress(event, location.id)}
                    onPointerMove={(event) => dragLocation(event, location.id)}
                    onPointerUp={(event) => endLocationPress(event, location.id)}
                    onPointerCancel={(event) => endLocationPress(event, location.id)}
                    onContextMenu={(event) => event.preventDefault()}
                    onSelectStart={(event) => event.preventDefault()}
                  >
                    <DashboardLocationTitle location={location} onRename={renameLocation} />
                    <button
                      className="grid size-11 shrink-0 place-items-center rounded-full bg-red-50 text-red-700 transition active:scale-95"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteId(location.id);
                      }}
                      aria-label={`Delete ${location.name}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </section>
      )}

      <button
        className="vault-fab fixed bottom-5 grid size-16 place-items-center rounded-full bg-vault-ink text-white shadow-2xl shadow-rose-300/60 transition active:scale-95"
        onClick={() => setAddingLocation(true)}
        aria-label="Add location"
      >
        <Plus size={30} />
      </button>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete location?"
        message={
          deleteSummary
            ? `This will delete "${deleteLocationTarget.name}" with ${deleteSummary.rooms} room${deleteSummary.rooms === 1 ? "" : "s"}, ${deleteSummary.images} image${deleteSummary.images === 1 ? "" : "s"}, ${deleteSummary.pins} pin${deleteSummary.pins === 1 ? "" : "s"}, and ${deleteSummary.items} item${deleteSummary.items === 1 ? "" : "s"}.`
            : "This removes the location, photos, pins, and stored items from this browser."
        }
        requireCheckbox
        checkboxLabel="Are you sure?"
        onCancel={() => setDeleteId(null)}
        onConfirm={deleteLocation}
      />
      {locationDragPreview && (
        <FloatingDragCard preview={locationDragPreview}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-vault-pink text-vault-ink">
            <ChevronRight size={19} />
          </span>
          <span className="min-w-0 flex-1 truncate text-3xl font-black">{locationDragPreview.label}</span>
        </FloatingDragCard>
      )}
    </div>
  );
}

function SearchThumbnail({ result }) {
  if (result.thumbnailUrl) {
    return (
      <div className="size-14 shrink-0 overflow-hidden rounded-2xl bg-pink-50 shadow-sm">
        <img className="h-full w-full object-cover" src={result.thumbnailUrl} alt="" loading="lazy" />
      </div>
    );
  }

  return (
    <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-vault-pink text-xs font-black uppercase text-vault-muted shadow-sm">
      {result.type.slice(0, 2)}
    </div>
  );
}

function summarizeLocation(location) {
  const images = [...(location.images || []), ...(location.rooms || []).flatMap((room) => room.images || [])];
  const pins = images.flatMap((image) => image.pins || []);
  const items = pins.flatMap((pin) => pin.items || []);
  return {
    rooms: (location.rooms || []).length,
    images: images.length,
    pins: pins.length,
    items: items.length,
  };
}

function getDropIndexFromRects(rects, pointerY) {
  const targetIndex = rects.findIndex((rect) => pointerY < rect.center);
  return targetIndex === -1 ? rects.length : targetIndex;
}

function DashboardLocationTitle({ location, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(location.name);

  function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== location.name) onRename(location.id, trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="min-w-0 flex-1" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <input
          className="min-h-12 w-full rounded-2xl border border-rose-100 bg-white px-4 text-base font-semibold outline-none focus:border-vault-rose"
          value={draft}
          autoFocus
          placeholder="Location name"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") {
              setDraft(location.name);
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="truncate text-3xl font-black leading-tight">{location.name}</span>
      <button
        className="grid size-9 shrink-0 place-items-center rounded-full bg-pink-50 text-vault-muted transition active:scale-95"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setDraft(location.name);
          setEditing(true);
        }}
        aria-label={`Rename ${location.name}`}
      >
        <Pencil size={15} />
      </button>
    </div>
  );
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
