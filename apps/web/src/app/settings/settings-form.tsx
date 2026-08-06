"use client";

import { Check, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function SettingsForm({ email, name, role }: { email: string; name: string; role: "owner" | "member" }) {
  const [pending, setPending] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setMessage(null);
    const data = new FormData(form);
    const result = await authClient.changePassword({
      currentPassword: String(data.get("currentPassword") ?? ""),
      newPassword: String(data.get("newPassword") ?? ""),
      revokeOtherSessions: true,
    });
    setPending(false);
    if (result.error) {
      setMessage("The current password was not accepted. No changes were made.");
      return;
    }
    form.reset();
    setMessage("Password updated. Other sessions were signed out.");
  }

  return <div className="settings-sections"><section><p className="eyebrow">Profile</p><h2>Account</h2><dl><div><dt>Name</dt><dd>{name}</dd></div><div><dt>Email</dt><dd>{email}</dd></div><div><dt>Workspace role</dt><dd>{role}</dd></div></dl></section><section><div className="section-title"><div><p className="eyebrow">Security</p><h2>Change password</h2></div><button className="icon-button" type="button" title={showPasswords ? "Hide passwords" : "Show passwords"} aria-label={showPasswords ? "Hide passwords" : "Show passwords"} onClick={() => setShowPasswords((visible) => !visible)}>{showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}</button></div><form className="settings-form" onSubmit={changePassword}><label>Current password<input name="currentPassword" type={showPasswords ? "text" : "password"} autoComplete="current-password" required /></label><label>New password<input name="newPassword" type={showPasswords ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} /></label>{message && <p className={message.startsWith("Password updated") ? "settings-success" : "auth-error"} role="status">{message}</p>}<button className="primary-button" type="submit" disabled={pending}>{pending ? <LoaderCircle className="state-spinner" size={16} /> : <Check size={16} />} Update password</button></form></section><section><p className="eyebrow">Privacy</p><h2>Data requests</h2><p>To request a workspace export or account deletion during the 0.1 release, contact <a href="mailto:privacy@capchur.io">privacy@capchur.io</a>. Requests are verified before data is changed.</p></section></div>;
}