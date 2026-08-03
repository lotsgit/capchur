"use client";

import { Link2, LoaderCircle } from "lucide-react";
import { useState } from "react";

export function ConnectExtension({ redirectUri }: { redirectUri: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/extension/authorize", { method: "POST" });
    if (response.status === 401) {
      const returnPath = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/sign-in?callback=${encodeURIComponent(returnPath)}`);
      return;
    }
    if (!response.ok) {
      setError("This workspace could not authorize the extension.");
      setPending(false);
      return;
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || typeof (body as { code?: unknown }).code !== "string") {
      setError("The authorization response was invalid.");
      setPending(false);
      return;
    }
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", (body as { code: string }).code);
    window.location.assign(callback.toString());
  }

  return (
    <main className="state-page">
      <div className="state-mark" aria-hidden="true"><Link2 size={20} /></div>
      <h1>Connect Capchur</h1>
      <p>Authorize this browser extension to sync recordings into your workspace.</p>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary-button" type="button" disabled={pending} onClick={() => void connect()}>
        {pending ? <LoaderCircle className="state-spinner" size={17} /> : <Link2 size={17} />}
        Connect extension
      </button>
    </main>
  );
}