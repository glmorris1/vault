import { Check, Pencil } from "lucide-react";
import { useState } from "react";

export function EditableText({ value, onSave, className = "", inputClassName = "", textClassName = "", placeholder = "Name" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          className={`min-w-0 flex-1 rounded-2xl border border-rose-100 bg-white px-4 py-3 font-semibold outline-none focus:border-vault-rose ${inputClassName}`}
          value={draft}
          placeholder={placeholder}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") setEditing(false);
          }}
        />
        <button className="grid size-11 place-items-center rounded-full bg-vault-ink text-white" onClick={save} aria-label="Save name">
          <Check size={18} />
        </button>
      </div>
    );
  }

  return (
    <button className={`tap-highlight flex min-w-0 items-center gap-2 text-left ${className}`} onClick={() => setEditing(true)}>
      <span className={`truncate ${textClassName}`}>{value || placeholder}</span>
      <Pencil className="shrink-0 text-vault-muted" size={16} />
    </button>
  );
}
