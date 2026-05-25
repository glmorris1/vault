import { Fingerprint, Lock, Mail, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import {
  canUseBiometricUnlock,
  clearSavedLoginCredentials,
  enableBiometricUnlock,
  getRememberedEmail,
  getSavedLoginCredentials,
  hasSavedLoginCredentials,
  markBiometricSessionUnlocked,
  savedLoginRequiresBiometric,
  saveLoginCredentials,
  setRememberedEmail,
} from "../services/authPreferences.js";
import { isFirebaseConfigured, loginUser, registerUser } from "../services/firebase.js";
import vaultLogo from "../assets/vault-watermark.svg";

export function LoginPage() {
  const rememberedEmail = getRememberedEmail();
  const [mode, setMode] = useState(rememberedEmail ? "login" : "register");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState(() => rememberedEmail);
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [useBiometrics, setUseBiometrics] = useState(() => savedLoginRequiresBiometric());
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [savedCredentialsAvailable, setSavedCredentialsAvailable] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [triedAutomaticSavedLogin, setTriedAutomaticSavedLogin] = useState(false);

  useEffect(() => {
    let mounted = true;
    canUseBiometricUnlock().then((available) => {
      if (mounted) setBiometricsAvailable(available);
    });
    hasSavedLoginCredentials().then((available) => {
      if (mounted) setSavedCredentialsAvailable(available);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "login" || !savedCredentialsAvailable || !savedLoginRequiresBiometric() || triedAutomaticSavedLogin || busy) return;
    setTriedAutomaticSavedLogin(true);
    handleSavedLogin();
  }, [busy, mode, savedCredentialsAvailable, triedAutomaticSavedLogin]);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("");
    setBusy(true);
    try {
      const trimmedEmail = email.trim();
      const shouldSaveLogin = rememberLogin || useBiometrics;
      const authOptions = { email: trimmedEmail, password, rememberLogin: shouldSaveLogin };
      let user;
      if (mode === "register") {
        user = await registerUser({ username: username.trim(), ...authOptions });
      } else {
        user = await loginUser(authOptions);
      }

      setRememberedEmail(shouldSaveLogin ? trimmedEmail : "");
      markBiometricSessionUnlocked(user.uid);
      let saved = false;
      if (shouldSaveLogin) {
        saved = await saveLoginCredentials({ user, password, requireBiometric: useBiometrics });
        setSavedCredentialsAvailable(saved);
      } else {
        await clearSavedLoginCredentials();
        setSavedCredentialsAvailable(false);
      }

      if (useBiometrics && !saved) {
        enableBiometricUnlock(user).catch(() => setStatus("Signed in. Face ID can be enabled later from this device."));
      }
    } catch (error) {
      setStatus(error.message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  }

  async function handleSavedLogin() {
    setStatus("");
    setBusy(true);
    try {
      const credentials = await getSavedLoginCredentials({ requireBiometric: savedLoginRequiresBiometric() });
      if (!credentials) {
        setStatus("Saved login was not available on this device. Please sign in with your password once.");
        return;
      }
      setMode("login");
      setEmail(credentials.email);
      setPassword(credentials.password);
      const user = await loginUser({ ...credentials, rememberLogin: true });
      setRememberedEmail(credentials.email);
      markBiometricSessionUnlocked(user.uid);
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
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-[1.75rem] bg-white shadow-soft">
            <img className="size-12 object-contain" src={vaultLogo} alt="" />
          </div>
          <h1 className="gold-4 text-4xl font-black">Vault</h1>
          <p className="mt-1 text-sm font-black tracking-[0.18em] text-vault-ink">Life. Organized.</p>
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

            <div className="grid gap-2 rounded-2xl bg-pink-50 p-3">
              <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white px-3 text-sm font-black text-vault-ink shadow-sm">
                <input className="size-5 accent-vault-blue" type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} />
                Remember email and password
              </label>
              <label className={`flex min-h-11 items-center gap-3 rounded-xl bg-white px-3 text-sm font-black shadow-sm ${biometricsAvailable ? "text-vault-ink" : "text-vault-muted"}`}>
                <input
                  className="size-5 accent-vault-blue"
                  type="checkbox"
                  checked={useBiometrics}
                  disabled={!biometricsAvailable}
                  onChange={(event) => {
                    setUseBiometrics(event.target.checked);
                    if (event.target.checked) setRememberLogin(true);
                  }}
                />
                <Fingerprint size={18} />
                Use Face ID next time
              </label>
              {!biometricsAvailable && <p className="px-1 text-xs font-semibold leading-5 text-vault-muted">Face ID unlock appears when this device supports secure biometric sign-in.</p>}
            </div>

            {savedCredentialsAvailable && mode === "login" && (
              <button
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-vault-ink shadow-sm transition active:scale-[0.98]"
                type="button"
                onClick={handleSavedLogin}
                disabled={busy}
              >
                <Fingerprint size={18} />
                {savedLoginRequiresBiometric() ? "Sign in with Face ID" : "Sign in with saved password"}
              </button>
            )}

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
