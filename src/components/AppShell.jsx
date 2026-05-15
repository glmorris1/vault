import { ArrowLeft, Check, ChevronDown, ChevronRight, Info, ListOrdered, LogOut, Mail, Menu, Palette, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";



const themes = [
  { id: "default", label: "Default (Pink)" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "cream", label: "Linen" },
];

export function AppShell({ children, title, subtitle, showBack = false, user, onLogout, cloudError, theme = "default", onThemeChange, onAlphabetize }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openMenuSections, setOpenMenuSections] = useState(() => new Set(["theme"]));

  function toggleMenuSection(sectionId) {
    setOpenMenuSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

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

            <MenuSection
              id="theme"
              className="mt-6"
              icon={<Palette size={21} />}
              title="Theme"
              open={openMenuSections.has("theme")}
              onToggle={() => toggleMenuSection("theme")}
            >
              <div className="grid grid-cols-2 gap-2">
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
            </MenuSection>

            <MenuSection
              id="about"
              icon={<Info size={21} />}
              title="About"
              open={openMenuSections.has("about")}
              onToggle={() => toggleMenuSection("about")}
            >
              <p className="text-sm font-semibold leading-6 text-vault-muted">
                Vault was created by Lindsey Morris to help people organize their homes, workspaces, and lives by making it easier to remember where everything belongs.
              </p>
            </MenuSection>

            <MenuSection
              id="contact"
              icon={<Mail size={21} />}
              title="Contact"
              open={openMenuSections.has("contact")}
              onToggle={() => toggleMenuSection("contact")}
            >
              <a
                className="flex min-h-12 items-center rounded-2xl bg-vault-pink/55 px-4 text-sm font-black text-vault-ink transition active:scale-[0.98]"
                href="mailto:sakurasimplicityllc@gmail.com"
              >
                sakurasimplicityllc@gmail.com
              </a>
            </MenuSection>

            <MenuSection
              id="alphabetize"
              icon={<ListOrdered size={21} />}
              title="Alphabetize Me!"
              open={openMenuSections.has("alphabetize")}
              onToggle={() => toggleMenuSection("alphabetize")}
            >
              <p className="text-sm font-semibold leading-6 text-vault-muted">
                Click this if you, like me, just can't even, and need everything to be alphabetized. We'll put everything in its proper order.
              </p>
              <button
                className="inline-flex min-h-11 w-fit items-center justify-center rounded-2xl bg-vault-blue px-5 text-sm font-black tracking-[0.16em] text-white shadow-soft transition active:scale-[0.98]"
                onClick={onAlphabetize}
                type="button"
              >
                ABC
              </button>
            </MenuSection>

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

function MenuSection({ icon, title, open, onToggle, children, className = "" }) {
  return (
    <section className={`border-t border-rose-100 py-3 ${className}`}>
      <button
        type="button"
        className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-1 text-left text-lg font-black text-vault-ink transition active:scale-[0.99]"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-vault-pink text-vault-ink">{icon}</span>
        <span className="min-w-0 flex-1">{title}</span>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-vault-pink/70 text-vault-muted">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>
      </button>
      {open && <div className="grid gap-3 pb-2 pt-3">{children}</div>}
    </section>
  );
}
