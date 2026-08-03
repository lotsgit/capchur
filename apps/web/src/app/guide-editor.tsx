"use client";

import Image from "next/image";
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, CircleHelp, FileText,
  FolderOpen, LayoutTemplate, LoaderCircle, PanelLeft, Play,
  RotateCcw, Settings, Sparkles,
} from "lucide-react";
import { startTransition, useEffect, useState } from "react";

import type { Guide, GuideStep } from "@/lib/contracts";
import {
  moveGuideStep, updateGuideDetails, updateGuideStep, type StepDirection,
} from "@/lib/guide-editor-state";
import { loadGuideFixture } from "@/lib/guide-fixture";
import { AccountControl } from "@/app/account-control";

type LoadState = "loading" | "ready" | "error";
type GuideLoader = () => Promise<Guide>;

export function GuideEditor({
  fixtureLoader = loadGuideFixture,
  identity,
}: {
  fixtureLoader?: GuideLoader;
  identity?: { name: string; role: "owner" | "member" };
}) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  function acceptGuide(loadedGuide: Guide) {
    startTransition(() => {
      setGuide(loadedGuide);
      setSelectedStepId(loadedGuide.steps[0]?.id ?? null);
      setUnsaved(false);
      setLoadState("ready");
    });
  }

  function loadFixture() {
    setLoadState("loading");
    setSaveMessage(null);
    fixtureLoader().then(acceptGuide).catch(() => setLoadState("error"));
  }

  useEffect(() => {
    let active = true;
    fixtureLoader()
      .then((loadedGuide) => { if (active) acceptGuide(loadedGuide); })
      .catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, [fixtureLoader]);

  function commit(nextGuide: Guide) {
    if (nextGuide === guide) return;
    setGuide(nextGuide);
    setUnsaved(true);
    setSaveMessage(null);
  }

  function moveStep(stepId: string, direction: StepDirection) {
    if (guide) commit(moveGuideStep(guide, stepId, direction, guide.updatedAt + 1));
  }

  function editStep(changes: Pick<GuideStep, "title" | "description">) {
    if (guide && selectedStepId) commit(updateGuideStep(guide, selectedStepId, changes, guide.updatedAt + 1));
  }

  const selectedStep = guide?.steps.find((step) => step.id === selectedStepId) ?? null;

  if (loadState === "loading") {
    return <main className="state-page" aria-busy="true"><LoaderCircle className="state-spinner" /><p>Opening your guide workspace</p></main>;
  }

  if (loadState === "error") {
    return (
      <main className="state-page">
        <div className="state-mark state-mark--error" aria-hidden="true">!</div>
        <h1>Guide unavailable</h1>
        <p>The local fixture could not be validated. Nothing was changed.</p>
        <button className="primary-button" type="button" onClick={loadFixture}><RotateCcw size={16} /> Retry</button>
      </main>
    );
  }

  if (!guide) {
    return <main className="state-page"><FolderOpen size={28} /><h1>No guide selected</h1><p>Choose a guide from your workspace to begin editing.</p></main>;
  }

  return (
    <main className="editor-shell">
      <aside className="workspace-rail" aria-label="Workspace navigation">
        <a className="brand" href="#editor" aria-label="Capchur home">C</a>
        <nav className="rail-nav" aria-label="Primary">
          <RailLink label="Guides" active><FileText /></RailLink>
          <RailLink label="Templates"><LayoutTemplate /></RailLink>
          <RailLink label="Capture"><Play /></RailLink>
        </nav>
        <nav className="rail-nav rail-nav--bottom" aria-label="Support">
          <RailLink label="Help"><CircleHelp /></RailLink>
          <RailLink label="Settings"><Settings /></RailLink>
        </nav>
      </aside>

      <section className="guide-panel" aria-label="Guide details">
        <div className="panel-heading">
          <a className="back-link" href="#guides"><ArrowLeft size={15} /> All guides</a>
          <span className={`save-state ${unsaved ? "save-state--unsaved" : ""}`} role="status">{unsaved ? "Unsaved changes" : "Draft saved"}</span>
        </div>
        <div className="guide-copy">
          <label htmlFor="guide-title">Guide title</label>
          <input id="guide-title" className="guide-title-input" value={guide.title} onChange={(event) => commit(updateGuideDetails(guide, { title: event.target.value, description: guide.description }, guide.updatedAt + 1))} />
          <textarea aria-label="Guide description" rows={2} value={guide.description} onChange={(event) => commit(updateGuideDetails(guide, { title: guide.title, description: event.target.value }, guide.updatedAt + 1))} />
        </div>
        <div className="steps-heading">
          <div><p className="eyebrow">Sequence</p><h2>{guide.steps.length} steps</h2></div>
          <button className="icon-button" type="button" title="Toggle step panel" aria-label="Toggle step panel"><PanelLeft size={17} /></button>
        </div>
        {guide.steps.length === 0 ? (
          <div className="steps-empty"><Sparkles size={22} /><strong>Your first step starts here</strong><span>Capture a workflow or add a step manually.</span></div>
        ) : (
          <ol className="step-list" aria-label="Guide steps">
            {guide.steps.map((step, index) => (
              <li key={step.id}>
                <button type="button" className={`step-select ${step.id === selectedStepId ? "step-select--active" : ""}`} onClick={() => setSelectedStepId(step.id)} aria-current={step.id === selectedStepId ? "step" : undefined}>
                  <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="step-select__copy"><strong>{step.title}</strong><span>{step.description || "No description"}</span></span>
                </button>
                <span className="step-order-controls">
                  <button type="button" title="Move step up" aria-label={`Move ${step.title} up`} disabled={index === 0} onClick={() => moveStep(step.id, -1)}><ArrowUp size={14} /></button>
                  <button type="button" title="Move step down" aria-label={`Move ${step.title} down`} disabled={index === guide.steps.length - 1} onClick={() => moveStep(step.id, 1)}><ArrowDown size={14} /></button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="editor-workspace" id="editor">
        <header className="editor-toolbar">
          <div><p className="eyebrow">Guide editor</p><h1>{selectedStep ? `Step ${selectedStep.position + 1}` : "Guide overview"}</h1></div>
          <div className="toolbar-actions">
            {saveMessage && <span className="saved-message" role="status"><Check size={14} /> {saveMessage}</span>}
            <button className="primary-button" type="button" disabled={!unsaved} onClick={() => { setUnsaved(false); setSaveMessage("Preview saved"); }}><Check size={16} /> Save draft</button>
            {identity && <AccountControl name={identity.name} role={identity.role} />}
          </div>
        </header>
        {selectedStep ? (
          <div className="editor-content">
            <MediaCanvas step={selectedStep} />
            <section className="step-editor" aria-labelledby="step-editor-heading">
              <div className="section-title"><div><p className="eyebrow">Instruction</p><h2 id="step-editor-heading">What should the reader do?</h2></div><span>{selectedStep.title.length}/2000</span></div>
              <label htmlFor="step-title">Step title</label>
              <input id="step-title" value={selectedStep.title} onChange={(event) => editStep({ title: event.target.value, description: selectedStep.description })} />
              <label htmlFor="step-description">Supporting detail</label>
              <textarea id="step-description" rows={4} value={selectedStep.description} onChange={(event) => editStep({ title: selectedStep.title, description: event.target.value })} />
            </section>
          </div>
        ) : (
          <div className="editor-empty"><FolderOpen size={28} /><h2>Select a step to edit</h2></div>
        )}
      </section>
    </main>
  );
}

function RailLink({ children, label, active = false }: { children: React.ReactNode; label: string; active?: boolean }) {
  return <a className={active ? "active" : ""} href={`#${label.toLowerCase()}`} title={label} aria-label={label}>{children}<span>{label}</span></a>;
}

function MediaCanvas({ step }: { step: GuideStep }) {
  if (!step.media) return <section className="media-canvas media-canvas--empty"><FolderOpen size={26} /><strong>No media for this step</strong></section>;
  const annotation = step.annotation;
  return (
    <section className="media-section" aria-label="Step media">
      <div className="media-label"><span>Screenshot</span><span>{step.media.width} × {step.media.height}</span></div>
      <div className="media-canvas" style={{ aspectRatio: `${step.media.width} / ${step.media.height}` }}>
        <Image src={step.media.source} alt={step.media.alt} fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 70vw, 56vw" priority />
        {annotation && !annotation.hidden && (
          <span className="media-highlight" aria-label="Highlighted target" style={{ left: `${(annotation.rect.x / step.media.width) * 100}%`, top: `${(annotation.rect.y / step.media.height) * 100}%`, width: `${(annotation.rect.width / step.media.width) * 100}%`, height: `${(annotation.rect.height / step.media.height) * 100}%` }} />
        )}
      </div>
    </section>
  );
}