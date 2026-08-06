"use client";

import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

export function SignInForm({ callbackPath = "/" }: { callbackPath?: string }) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const result = mode === "sign-in"
      ? await authClient.signIn.email({ email, password })
      : await authClient.signUp.email({
          email,
          password,
          name: String(data.get("name") ?? "").trim(),
        });

    if (result.error) {
      setError(result.error.message ?? "Authentication failed. Please try again.");
      setPending(false);
      return;
    }
    window.location.assign(callbackPath);
  }

  return (
    <section className="auth-form-panel" aria-label={mode === "sign-in" ? "Sign in" : "Create account"}>
      <div className="auth-tabs" role="group" aria-label="Authentication mode">
        <button type="button" aria-pressed={mode === "sign-in"} onClick={() => { setMode("sign-in"); setError(null); }}>Sign in</button>
        <button type="button" aria-pressed={mode === "sign-up"} onClick={() => { setMode("sign-up"); setError(null); }}>Create account</button>
      </div>
      <div>
        <p className="eyebrow">{mode === "sign-in" ? "Welcome back" : "New workspace"}</p>
        <h2>{mode === "sign-in" ? "Open your guides" : "Create your workspace"}</h2>
      </div>
      <form onSubmit={submit}>
        {mode === "sign-up" && <label>Display name<input name="name" autoComplete="name" required minLength={2} /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <div className="auth-field"><label htmlFor="auth-password">Password</label><span className="password-field"><input id="auth-password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={12} maxLength={128} /><button type="button" title={showPassword ? "Hide password" : "Show password"} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></div>
        {mode === "sign-in" && <Link className="auth-text-link" href="/forgot-password">Forgot password?</Link>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button auth-submit" type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="state-spinner" size={17} /> : <ArrowRight size={17} />}
          {mode === "sign-in" ? "Sign in" : "Create workspace"}
        </button>
      </form>
    </section>
  );
}