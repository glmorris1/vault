import { Button } from "./Button.jsx";
import { useEffect, useState } from "react";

export function ConfirmDialog({ open, title, message, confirmLabel = "Delete", requireCheckbox = false, checkboxLabel = "OK to delete", onConfirm, onCancel }) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-vault-ink/30 p-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-vault-ink">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-vault-muted">{message}</p>
        {requireCheckbox && (
          <label className="mt-5 flex items-center gap-3 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700">
            <input className="size-5 accent-red-600" type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            {checkboxLabel}
          </label>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={requireCheckbox && !checked}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
