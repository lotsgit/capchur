"use client";

import { useEffect, useRef, useState } from "react";

import { loadAiPreferences, saveAiPreferences } from "@/lib/ai-preferences-client";
import type { AiPreferencesWrite } from "@/lib/contracts";

interface AiPreferencesDialogProps {
  onResolved: (preferences: AiPreferencesWrite) => void;
}

/** Shown once, on first use, so a new account picks its AI processing location and trigger mode. */
export function AiPreferencesDialog({ onResolved }: AiPreferencesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [processingMode, setProcessingMode] = useState<AiPreferencesWrite["processingMode"]>("online");
  const [triggerMode, setTriggerMode] = useState<AiPreferencesWrite["triggerMode"]>("automatic");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAiPreferences().then((preferences) => {
      if (cancelled) return;
      if (preferences) {
        onResolved(preferences);
        return;
      }
      setOpen(true);
    }).catch(() => {
      // AI notes stay available with their defaults if preferences cannot be loaded.
      onResolved({ processingMode: "online", triggerMode: "automatic" });
    });
    return () => {
      cancelled = true;
    };
    // Runs once per mount; onResolved is expected to be stable for the editor's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);

  if (!open) return null;

  async function confirm() {
    setPending(true);
    const write: AiPreferencesWrite = { processingMode, triggerMode };
    try {
      await saveAiPreferences(write);
    } finally {
      setPending(false);
      setOpen(false);
      onResolved(write);
    }
  }

  return (
    <dialog ref={dialogRef} className="ai-preferences-dialog" aria-labelledby="ai-preferences-title">
      <h2 id="ai-preferences-title">Set up AI notes</h2>
      <p>
        Capchur can draft step notes and a guide introduction automatically. Choose how it should
        run, then change this anytime in Settings.
      </p>
      <fieldset>
        <legend>Where should AI processing run?</legend>
        <label>
          <input
            type="radio"
            name="processingMode"
            value="online"
            checked={processingMode === "online"}
            onChange={() => setProcessingMode("online")}
          />
          Online — a free hosted model, lower latency, step text leaves your device
        </label>
        <label>
          <input
            type="radio"
            name="processingMode"
            value="local"
            checked={processingMode === "local"}
            onChange={() => setProcessingMode("local")}
          />
          Local in this browser — highest privacy, needs a one-time model download and more time
        </label>
      </fieldset>
      <fieldset>
        <legend>When should notes be generated?</legend>
        <label>
          <input
            type="radio"
            name="triggerMode"
            value="automatic"
            checked={triggerMode === "automatic"}
            onChange={() => setTriggerMode("automatic")}
          />
          Automatically, as soon as a guide or step is ready
        </label>
        <label>
          <input
            type="radio"
            name="triggerMode"
            value="manual"
            checked={triggerMode === "manual"}
            onChange={() => setTriggerMode("manual")}
          />
          Only when I click Generate
        </label>
      </fieldset>
      <button type="button" className="primary-button" disabled={pending} onClick={() => { void confirm(); }}>
        Save and continue
      </button>
    </dialog>
  );
}
