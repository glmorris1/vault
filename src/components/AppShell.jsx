import { ArrowLeft, Check, Info, LogOut, Menu, Palette, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";


const lindseyHeadshot = "data:image/jpeg;base64,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";

const themes = [
  { id: "default", label: "Default" },
  { id: "pink", label: "Pink" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
];

export function AppShell({ children, title, subtitle, showBack = false, user, onLogout, cloudError, theme = "default", onThemeChange }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="safe-bottom mx-auto min-h-svh w-full max-w-xl px-4 pt-4 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-white/70 bg-[color-mix(in_srgb,var(--vault-surface)_90%,transparent)] px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="grid min-h-14 grid-cols-[2.75rem_1fr_2.75rem] items-center gap-3">
          <div className="flex justify-start">
            {showBack && (
              <button className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-vault-ink shadow-sm" onClick={() => navigate(-1)} aria-label="Go back">
                <ArrowLeft size={20} />
              </button>
            )}
          </div>
          <div className="min-w-0 text-center">
            <h1 className={title === "Vault" ? "gold-4 truncate text-4xl font-black" : "truncate text-4xl font-black tracking-tight text-vault-ink"}>{title}</h1>
            {title === "Vault" && <p className="mt-0.5 truncate text-sm font-black tracking-[0.18em] text-vault-ink">Life. Organized.</p>}
            {subtitle && <p className="truncate text-sm font-medium text-vault-muted">{subtitle}</p>}
          </div>
          {user && (
            <div className="relative flex justify-end">
              <button className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-vault-ink shadow-sm" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                <Menu size={22} />
              </button>
            </div>
          )}
        </div>
      </header>
      {cloudError && <p className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">{cloudError}</p>}
      {children}
      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-vault-ink/25 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <aside
            className="safe-bottom ml-auto flex h-full w-[min(22rem,88vw)] flex-col overflow-y-auto bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            aria-label="Vault menu"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-vault-muted">Menu</p>
                <h2 className="mt-1 text-2xl font-black text-vault-ink">Vault</h2>
              </div>
              <button className="grid size-11 place-items-center rounded-full bg-vault-pink text-vault-ink" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>

            <section className="mt-6 border-t border-rose-100 py-5">
              <div className="flex items-center gap-3 text-lg font-black text-vault-ink">
                <Palette size={21} />
                Theme
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {themes.map((item) => (
                  <button
                    key={item.id}
                    className={`flex min-h-11 items-center justify-between rounded-2xl border px-4 text-sm font-black transition ${
                      theme === item.id ? "border-vault-blue bg-vault-blue text-white" : "border-rose-100 bg-vault-pink/55 text-vault-ink"
                    }`}
                    onClick={() => onThemeChange?.(item.id)}
                    type="button"
                  >
                    {item.label}
                    {theme === item.id && <Check size={16} />}
                  </button>
                ))}
              </div>
            </section>

            <section className="border-t border-rose-100 py-5">
              <div className="flex items-center gap-3 text-lg font-black text-vault-ink">
                <Info size={21} />
                About
              </div>
              <div className="mt-4 overflow-hidden rounded-[1.5rem] bg-vault-pink/60">
                <img className="h-44 w-full object-cover" src={lindseyHeadshot} alt="Lindsey Morris" />
              </div>
              <p className="mt-4 text-sm font-semibold leading-6 text-vault-muted">
                Vault was created by Lindsey Morris to help people organize their homes, workspaces, and lives by making it easier to remember where everything belongs.
              </p>
            </section>

            <div className="mt-auto border-t border-rose-100 pt-5">
              <button
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-5 text-base font-black text-red-700 transition active:scale-[0.98]"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout?.();
                }}
                type="button"
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
