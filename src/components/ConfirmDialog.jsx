import { Button } from "./Button.jsx";

export function ConfirmDialog({ open, title, message, confirmLabel = "Delete", onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-vault-ink/30 p-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-vault-ink">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-vault-muted">{message}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
