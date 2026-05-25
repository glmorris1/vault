import { ArrowLeft, Check, ChevronDown, ChevronRight, Info, LogOut, Mail, Menu, Mic, Palette, Share2, X } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createShareUrl } from "../services/shareLinks.js";



const themes = [
  { id: "default", label: "Default (Pink)" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "cream", label: "Linen" },
];

export function AppShell({ children, title, subtitle, showBack = false, user, onLogout, cloudError, theme = "default", onThemeChange, onAlphabetize, data }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openMenuSections, setOpenMenuSections] = useState(() => new Set(["theme"]));
  const [alphabetized, setAlphabetized] = useState(false);
  const [selectedShareIds, setSelectedShareIds] = useState(() => new Set());
  const [shareStatus, setShareStatus] = useState("");

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

  function closeMenu() {
    setMenuOpen(false);
    setAlphabetized(false);
    setShareStatus("");
  }

  function toggleShareLocation(locationId) {
    setSelectedShareIds((current) => {
      const next = new Set(current);
      if (next.has(locationId)) {
        next.delete(locationId);
      } else {
        next.add(locationId);
      }
      return next;
    });
  }

  async function shareSelectedLocations() {
    const locations = (data?.locations || []).filter((item) => selectedShareIds.has(item.id));
    if (locations.length === 0) {
      setShareStatus("Choose at least one location to share.");
      return;
    }
    const url = await createShareUrl(locations);
    try {
      if (window.navigator.share) {
        await window.navigator.share({
          title: "Vault shared locations",
          text: locations.length === 1 ? `Shared location: ${locations[0].name}` : `Shared ${locations.length} Vault locations`,
          url,
        });
      } else {
        await window.navigator.clipboard.writeText(url);
        setShareStatus("Share link copied.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setShareStatus("The share link is ready, but this device could not open sharing.");
    }
  }

  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  return (
    <div className="safe-bottom mx-auto min-h-svh w-full max-w-xl px-4 pt-4 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-white/70 bg-[color-mix(in_srgb,var(--vault-surface)_90%,transparent)] px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="grid min-h-14 grid-cols-[2.75rem_1fr_2.75rem] items-center gap-3">
          <div className="flex justify-start">
            {showBack && (
              <button
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-vault-ink shadow-sm"
                onClick={() => {
                  if (location.state?.backTo) {
                    navigate(location.state.backTo, { replace: true });
                    return;
                  }
                  navigate(-1);
                }}
                aria-label="Go back"
              >
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
        <div className="fixed inset-0 z-50 bg-vault-ink/25 backdrop-blur-sm" onClick={closeMenu}>
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
              <button className="grid size-11 place-items-center rounded-full bg-vault-pink text-vault-ink" onClick={closeMenu} aria-label="Close menu">
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
              id="share"
              icon={<Share2 size={21} />}
              title="Share With Others"
              open={openMenuSections.has("share")}
              onToggle={() => toggleMenuSection("share")}
            >
              <p className="text-sm font-semibold leading-6 text-vault-muted">Choose exactly which locations this link can show.</p>
              {(data?.locations || []).length === 0 ? (
                <p className="rounded-2xl bg-vault-pink/60 p-3 text-sm font-semibold text-vault-muted">Add a location first, then you can share it.</p>
              ) : (
                <div className="grid gap-2">
                  {(data?.locations || []).map((item) => (
                    <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-2xl bg-vault-pink/55 px-3 text-sm font-black text-vault-ink">
                      <input
                        className="size-5 accent-vault-blue"
                        type="checkbox"
                        checked={selectedShareIds.has(item.id)}
                        onChange={() => toggleShareLocation(item.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <button
                className="flex min-h-12 w-fit items-center justify-center rounded-2xl bg-white px-5 text-sm font-black text-vault-ink shadow-sm transition active:scale-[0.98]"
                onClick={shareSelectedLocations}
                type="button"
              >
                Share selected
              </button>
              {shareStatus && <p className="rounded-2xl bg-vault-pink/60 p-3 text-sm font-semibold text-vault-muted">{shareStatus}</p>}
            </MenuSection>

            <MenuSection
              id="alexa"
              icon={<Mic size={21} />}
              title="Alexa"
              open={openMenuSections.has("alexa")}
              onToggle={() => toggleMenuSection("alexa")}
            >
              <p className="text-sm font-semibold leading-6 text-vault-muted">
                Connect through the Alexa app while Vault is still a development skill.
              </p>
              <button
                className="inline-flex min-h-12 w-fit items-center justify-center rounded-2xl bg-vault-blue px-5 text-sm font-black text-white shadow-soft transition active:scale-[0.98]"
                onClick={() => window.navigator.clipboard?.writeText("Open the Alexa app, go to Skills, choose Vault, then Settings, Link Account.")}
                type="button"
              >
                Copy linking steps
              </button>
              <p className="text-xs font-black leading-5 text-vault-muted">If Alexa says it cannot link, open the Alexa app, go to Skills, choose Vault, then Settings, Link Account.</p>
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
              icon={<span className="text-xs font-black tracking-tight">AZ</span>}
              title="Alphabetize Me!"
              open={openMenuSections.has("alphabetize")}
              onToggle={() => toggleMenuSection("alphabetize")}
            >
              <p className="text-sm font-semibold leading-6 text-vault-muted">
                Click this if you, like me, just can't even, and need everything to be alphabetized. We'll put everything in its proper order.
              </p>
              <button
                className={`inline-flex min-h-11 w-fit items-center justify-center rounded-2xl px-5 text-sm font-black tracking-[0.12em] text-white transition ${
                  alphabetized
                    ? "translate-y-0.5 bg-emerald-600 shadow-inner"
                    : "bg-vault-blue shadow-[0_6px_0_rgba(8,74,140,0.35),0_14px_22px_rgba(40,145,220,0.24)] active:translate-y-1 active:shadow-[0_2px_0_rgba(8,74,140,0.35),0_8px_14px_rgba(40,145,220,0.18)]"
                }`}
                onClick={() => {
                  onAlphabetize?.();
                  setAlphabetized(true);
                  window.setTimeout(() => setAlphabetized(false), 1800);
                }}
                type="button"
              >
                {alphabetized ? "Alphabetized!" : "ABC"}
              </button>
            </MenuSection>

            <div className="mt-auto border-t border-rose-100 pt-5">
              <button
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-5 text-base font-black text-red-700 transition active:scale-[0.98]"
                onClick={() => {
                  closeMenu();
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
