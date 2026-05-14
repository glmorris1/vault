import { ArrowLeft, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function AppShell({ children, title, subtitle, showBack = false, user, onLogout }) {
  const navigate = useNavigate();

  return (
    <div className="safe-bottom mx-auto min-h-svh w-full max-w-xl px-4 pt-4 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-white/70 bg-[#fff7fa]/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {showBack && (
              <button className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-vault-ink shadow-sm" onClick={() => navigate(-1)} aria-label="Go back">
                <ArrowLeft size={20} />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black tracking-tight text-vault-ink">{title}</h1>
              {subtitle && <p className="truncate text-sm font-medium text-vault-muted">{subtitle}</p>}
            </div>
          </div>
          {user && (
            <button className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-vault-ink shadow-sm" onClick={onLogout} aria-label="Sign out">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
