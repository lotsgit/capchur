"use client";

import { Link2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

async function completeConnection(redirectUri: string, signal?: AbortSignal) {
  const response = await fetch("/api/extension/authorize", { method: "POST", signal });
  if (response.status === 401) {
    const returnPath = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/sign-in?callback=${encodeURIComponent(returnPath)}`);
    return;
  }
  if (!response.ok) throw new Error("This workspace could not authorize the extension.");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || typeof (body as { code?: unknown }).code !== "string") {
    throw new Error("The authorization response was invalid.");
  }
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", (body as { code: string }).code);
  window.location.assign(callback.toString());
}

export function ConnectExtension({ redirectUri }: { redirectUri: string }) {
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setPending(true);
    setError(null);
    try {
      await completeConnection(redirectUri);
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : "This workspace could not authorize the extension.");
      setPending(false);
    }
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    completeConnection(redirectUri, controller.signal).catch((connectionError: unknown) => {
      if (!active) return;
      setError(connectionError instanceof Error ? connectionError.message : "This workspace could not authorize the extension.");
      setPending(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [redirectUri]);

  return (
    <main className="state-page">
      <div className="state-mark" aria-hidden="true"><Link2 size={20} /></div>
      <h1>Connecting Capchur</h1>
      <p>Securely connecting this browser extension to your workspace.</p>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {error
        ? <button className="primary-button" type="button" disabled={pending} onClick={() => void connect()}><Link2 size={17} /> Try again</button>
        : <LoaderCircle className="state-spinner" aria-label="Connecting extension" size={24} />}
    </main>
  );
}