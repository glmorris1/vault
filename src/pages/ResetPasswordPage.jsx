import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { getPasswordResetEmail, isFirebaseConfigured, resetVaultPassword } from "../services/firebase.js";

const vaultLogo = "./vault-icon.png";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oobCode = searchParams.get("oobCode") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [linkValid, setLinkValid] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function checkLink() {
      setStatus("");
      if (!isFirebaseConfigured || !oobCode) {
        setStatus("This password reset link is missing or expired.");
        setChecking(false);
        return;
      }
      try {
        const resetEmail = await getPasswordResetEmail(oobCode);
        if (!mounted) return;
        setEmail(resetEmail);
        setLinkValid(true);
      } catch (error) {
        if (!mounted) return;
        setStatus(formatResetError(error, "This password reset link is invalid or expired."));
      } finally {
        if (mounted) setChecking(false);
      }
    }

    checkLink();
    return () => {
      mounted = false;
    };
  }, [oobCode]);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("");
    if (password.length < 6) {
      setStatus("Use at least 6 characters for your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await resetVaultPassword({ oobCode, password });
      setStatus("Password reset. You can sign in with your new password now.");
      window.setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (error) {
      setStatus(formatResetError(error, "Vault could not reset your password. Please request a new reset link."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="safe-bottom mx-auto grid min-h-svh w-full max-w-xl place-items-center px-4 py-8 sm:px-6">
      <div className="w-full">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 size-16 overflow-hidden rounded-[1.75rem] bg-white shadow-soft">
            <img className="size-16 object-cover" src={vaultLogo} alt="" />
          </div>
          <h1 className="gold-4 text-4xl font-black">Vault</h1>
          <p className="mt-1 text-sm font-black tracking-[0.18em] text-vault-ink">Reset Password</p>
          <p className="mt-2 text-base font-medium text-vault-muted">Choose a new password to get back to your saved places.</p>
        </div>

        <Card className="p-5">
          {checking ? (
            <p className="rounded-2xl bg-pink-50 p-4 text-center text-sm font-black text-vault-muted">Checking reset link...</p>
          ) : (
            <form className="grid gap-3" onSubmit={handleSubmit}>
              {email && (
                <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 text-vault-muted">
                  <Mail size={18} />
                  <span className="min-w-0 flex-1 truncate text-sm font-black">{email}</span>
                </div>
              )}

              {linkValid && (
                <>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-vault-muted">New password</span>
                    <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 focus-within:border-vault-rose">
                      <Lock size={18} className="text-vault-muted" />
                      <input
                        className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
                        type={showPasswords ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <button
                        className="grid size-9 shrink-0 place-items-center rounded-full text-vault-muted transition active:scale-95"
                        type="button"
                        aria-label={showPasswords ? "Hide password" : "Show password"}
                        onClick={() => setShowPasswords((current) => !current)}
                      >
                        {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-vault-muted">Confirm password</span>
                    <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 focus-within:border-vault-rose">
                      <Lock size={18} className="text-vault-muted" />
                      <input
                        className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
                        type={showPasswords ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                      />
                      <button
                        className="grid size-9 shrink-0 place-items-center rounded-full text-vault-muted transition active:scale-95"
                        type="button"
                        aria-label={showPasswords ? "Hide password" : "Show password"}
                        onClick={() => setShowPasswords((current) => !current)}
                      >
                        {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>
                </>
              )}

              {status && <p className={`rounded-2xl p-3 text-sm font-semibold ${status.startsWith("Password reset") ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{status}</p>}

              {linkValid ? (
                <Button className="mt-2 w-full" type="submit" disabled={busy || password.length < 6 || password !== confirmPassword}>
                  {busy ? "Resetting..." : "Reset password"}
                </Button>
              ) : (
                <Link className="mt-2 flex min-h-12 items-center justify-center rounded-2xl bg-vault-ink px-5 text-base font-semibold text-white shadow-soft" to="/">
                  Back to sign in
                </Link>
              )}
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}

function formatResetError(error, fallback) {
  const message = error?.message || fallback;
  if (message.includes("expired-action-code")) return "This password reset link has expired. Please request a new one.";
  if (message.includes("invalid-action-code")) return "This password reset link is invalid. Please request a new one.";
  if (message.includes("weak-password")) return "Use at least 6 characters for your new password.";
  return message.replace("Firebase: ", "");
}
