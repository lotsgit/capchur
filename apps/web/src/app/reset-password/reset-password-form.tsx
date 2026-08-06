"use client";

import Link from "next/link";
import { Check, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token?: string }) {
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "This reset link is invalid or incomplete.");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) {
      setError("This reset link is invalid or has expired. Request a new link.");
      setPending(false);
      return;
    }
    setComplete(true);
  }

  if (complete) return <section className="auth-form-panel"><Check size={24} /><h2>Password updated</h2><p className="auth-copy">Your new password is ready to use.</p><Link className="primary-button" href="/sign-in">Continue to sign in</Link></section>;

  return (
    <section className="auth-form-panel" aria-label="Choose a new password">
      <div><p className="eyebrow">Account recovery</p><h2>Choose a new password</h2></div>
      <form onSubmit={submit}>
        <div className="auth-field"><label htmlFor="reset-password">New password</label><span className="password-field"><input id="reset-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} /><button type="button" title={showPassword ? "Hide password" : "Show password"} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></div>
        <label>Confirm password<input name="confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button auth-submit" type="submit" disabled={pending || !token}>{pending ? <LoaderCircle className="state-spinner" size={17} /> : <Check size={17} />} Update password</button>
      </form>
    </section>
  );
}