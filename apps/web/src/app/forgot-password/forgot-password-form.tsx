"use client";

import Link from "next/link";
import { ArrowLeft, LoaderCircle, Mail } from "lucide-react";
import { type FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const data = new FormData(event.currentTarget);
    await authClient.requestPasswordReset({
      email: String(data.get("email") ?? "").trim(),
      redirectTo: "/reset-password",
    });
    setSent(true);
    setPending(false);
  }

  if (sent) {
    return <section className="auth-form-panel"><Mail size={24} /><h2>Check your email</h2><p className="auth-copy">If an account matches that address, a password reset link is on its way. The link expires in 30 minutes.</p><Link className="secondary-command" href="/sign-in"><ArrowLeft size={15} /> Back to sign in</Link></section>;
  }

  return (
    <section className="auth-form-panel" aria-label="Reset password request">
      <div><p className="eyebrow">Account recovery</p><h2>Reset your password</h2></div>
      <p className="auth-copy">Enter your account email and we will send a one-time reset link.</p>
      <form onSubmit={submit}>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <button className="primary-button auth-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle className="state-spinner" size={17} /> : <Mail size={17} />} Send reset link</button>
        <Link className="auth-text-link" href="/sign-in"><ArrowLeft size={14} /> Back to sign in</Link>
      </form>
    </section>
  );
}