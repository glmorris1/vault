import { Archive, Lock, Mail, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { isFirebaseConfigured, loginUser, registerUser } from "../services/firebase.js";

export function LoginPage() {
  const [mode, setMode] = useState("register");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("");
    setBusy(true);
    try {
      if (mode === "register") {
        await registerUser({ username: username.trim(), email: email.trim(), password });
      } else {
        await loginUser({ email: email.trim(), password });
      }
    } catch (error) {
      setStatus(error.message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = isFirebaseConfigured && email.trim() && password.length >= 6 && (mode === "login" || username.trim());

  return (
    <main className="safe-bottom mx-auto grid min-h-svh w-full max-w-xl place-items-center px-4 py-8 sm:px-6">
      <div className="w-full">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-[1.75rem] bg-white text-vault-ink shadow-soft">
            <Archive size={30} />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-vault-ink">Vault</h1>
          <p className="mt-2 text-base font-medium text-vault-muted">Sign in to keep your home inventory synced.</p>
        </div>

        <Card className="p-5">
          <div className="mb-5 grid grid-cols-2 rounded-2xl bg-pink-50 p-1">
            <button
              className={`min-h-11 rounded-xl text-sm font-black transition ${mode === "register" ? "bg-white text-vault-ink shadow-sm" : "text-vault-muted"}`}
              onClick={() => setMode("register")}
              type="button"
            >
              Register
            </button>
            <button
              className={`min-h-11 rounded-xl text-sm font-black transition ${mode === "login" ? "bg-white text-vault-ink shadow-sm" : "text-vault-muted"}`}
              onClick={() => setMode("login")}
              type="button"
            >
              Login
            </button>
          </div>

          {!isFirebaseConfigured && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
              Cloud login needs Firebase settings before it can run on GitHub Pages.
            </div>
          )}

          <form className="grid gap-3" onSubmit={handleSubmit}>
            {mode === "register" && (
              <label className="grid gap-2">
                <span className="text-sm font-bold text-vault-muted">Username</span>
                <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 focus-within:border-vault-rose">
                  <UserRound size={18} className="text-vault-muted" />
                  <input className="min-w-0 flex-1 bg-transparent font-semibold outline-none" value={username} onChange={(event) => setUsername(event.target.value)} />
                </div>
              </label>
            )}

            <label className="grid gap-2">
              <span className="text-sm font-bold text-vault-muted">Email</span>
              <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 focus-within:border-vault-rose">
                <Mail size={18} className="text-vault-muted" />
                <input className="min-w-0 flex-1 bg-transparent font-semibold outline-none" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-vault-muted">Password</span>
              <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 focus-within:border-vault-rose">
                <Lock size={18} className="text-vault-muted" />
                <input className="min-w-0 flex-1 bg-transparent font-semibold outline-none" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
            </label>

            {status && <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{status}</p>}

            <Button className="mt-2 w-full" type="submit" disabled={!canSubmit || busy}>
              {busy ? "Working..." : mode === "register" ? "Create account" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
