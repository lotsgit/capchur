"use client";

import Link from "next/link";
import { FilePlus2, FolderOpen, LoaderCircle, Play, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AccountControl } from "@/app/account-control";
import { AppNavigation } from "@/app/app-navigation";
import { GuideSchema, type Guide } from "@/lib/contracts";

type LoadState = "loading" | "ready" | "error";

export function GuideDashboard({ identity }: { identity: { name: string; role: "owner" | "member" } }) {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadGuides() {
    setLoadState("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/guides");
      if (!response.ok) throw new Error("Guide list failed");
      setGuides(GuideSchema.array().parse(await response.json()));
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/guides")
      .then(async (response) => {
        if (!response.ok) throw new Error("Guide list failed");
        const loadedGuides = GuideSchema.array().parse(await response.json());
        if (active) {
          setGuides(loadedGuides);
          setLoadState("ready");
        }
      })
      .catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, []);

  async function createGuide() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/guides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Untitled guide",
          description: "",
          introduction: "",
          branding: { name: "", accentColor: "#164c3b", logoUrl: null },
          steps: [],
        }),
      });
      if (!response.ok) throw new Error("Guide creation failed");
      const guide = GuideSchema.parse(await response.json());
      window.location.assign(`/?guideId=${encodeURIComponent(guide.id)}`);
    } catch {
      setMessage("The guide could not be created. Try again.");
      setBusy(false);
    }
  }

  async function deleteGuide(guide: Guide) {
    if (!window.confirm(`Delete “${guide.title}”? This cannot be undone.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/guides/${encodeURIComponent(guide.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Guide deletion failed");
      setGuides((current) => current.filter((item) => item.id !== guide.id));
    } catch {
      setMessage("The guide could not be deleted. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <AppNavigation active="guides" />
      <section className="dashboard-workspace">
        <header className="dashboard-header">
          <div><p className="eyebrow">Workspace</p><h1>Your guides</h1></div>
          <div className="dashboard-actions">
            {identity.role === "owner" && <button className="primary-button" type="button" disabled={busy} onClick={() => { void createGuide(); }}><FilePlus2 size={16} /> New guide</button>}
            <AccountControl name={identity.name} role={identity.role} />
          </div>
        </header>

        <div className="dashboard-content">
          <div className="dashboard-intro">
            <div><p className="eyebrow">Library</p><h2>Recent work</h2></div>
            <Link className="secondary-command" href="/capture"><Play size={15} /> Capture a workflow</Link>
          </div>
          {message && <p className="dashboard-message" role="alert">{message}</p>}
          {loadState === "loading" && <div className="dashboard-state" aria-busy="true"><LoaderCircle className="state-spinner" /><span>Loading guides</span></div>}
          {loadState === "error" && <div className="dashboard-state"><RotateCcw /><strong>Guides unavailable</strong><button className="secondary-command" type="button" onClick={() => { void loadGuides(); }}>Retry</button></div>}
          {loadState === "ready" && guides.length === 0 && (
            <div className="dashboard-empty">
              <FolderOpen size={30} />
              <h2>No guides yet</h2>
              <p>Capture a browser workflow with the extension or start with a blank guide.</p>
              <div>{identity.role === "owner" && <button className="primary-button" type="button" disabled={busy} onClick={() => { void createGuide(); }}><FilePlus2 size={16} /> Create blank guide</button>}<Link className="secondary-command" href="/capture"><Play size={15} /> Set up capture</Link></div>
            </div>
          )}
          {loadState === "ready" && guides.length > 0 && (
            <ul className="guide-grid" aria-label="Workspace guides">
              {guides.map((guide) => (
                <li key={guide.id}>
                  <Link href={`/?guideId=${encodeURIComponent(guide.id)}`}>
                    <span className="guide-card-mark" aria-hidden="true">{String(guide.steps.length).padStart(2, "0")}</span>
                    <strong>{guide.title}</strong>
                    <span>{guide.description || "No summary yet"}</span>
                    <small>{guide.steps.length} {guide.steps.length === 1 ? "step" : "steps"} · Updated {new Date(guide.updatedAt).toLocaleDateString()}</small>
                  </Link>
                  {identity.role === "owner" && <button className="guide-delete" type="button" title="Delete guide" aria-label={`Delete ${guide.title}`} disabled={busy} onClick={() => { void deleteGuide(guide); }}><Trash2 size={15} /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}