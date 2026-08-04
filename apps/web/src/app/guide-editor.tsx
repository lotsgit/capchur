"use client";

import Image from "next/image";
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, CircleHelp, Copy, Crop,
  Eye, EyeOff, FileText, FolderOpen, LayoutTemplate, LoaderCircle,
  Play, Plus, Redo2, RotateCcw, Settings, Shield, Sparkles, Trash2,
  Undo2, ZoomIn,
} from "lucide-react";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { GuideSchema, type Guide, type GuideStep } from "@/lib/contracts";
import {
  addGuideStep, deleteGuideStep, duplicateGuideStep, moveGuideStep,
  updateGuideDetails, updateGuideStep, type StepDirection,
} from "@/lib/guide-editor-state";
import { loadGuideFixture } from "@/lib/guide-fixture";
import { AccountControl } from "@/app/account-control";

type LoadState = "loading" | "ready" | "error";
type GuideLoader = () => Promise<Guide>;
type GuideDetails = Pick<Guide, "title" | "description" | "introduction" | "branding">;

async function loadRequestedGuide(guideId: string | undefined, fixtureLoader: GuideLoader) {
  if (!guideId) return GuideSchema.parse(await fixtureLoader());
  const response = await fetch(`/api/guides/${encodeURIComponent(guideId)}`);
  if (!response.ok) throw new Error("Guide could not be loaded");
  return GuideSchema.parse(await response.json());
}

export function GuideEditor({
  fixtureLoader = loadGuideFixture,
  guideId,
  identity,
}: {
  fixtureLoader?: GuideLoader;
  guideId?: string;
  identity?: { name: string; role: "owner" | "member" };
}) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [past, setPast] = useState<Guide[]>([]);
  const [future, setFuture] = useState<Guide[]>([]);
  const [zoom, setZoom] = useState(100);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const guideRef = useRef<Guide | null>(null);

  useEffect(() => {
    guideRef.current = guide;
  }, [guide]);

  function acceptGuide(loadedGuide: Guide) {
    startTransition(() => {
      setGuide(loadedGuide);
      setSelectedStepId(loadedGuide.steps[0]?.id ?? null);
      setUnsaved(false);
      setPast([]);
      setFuture([]);
      setSavedRevision(loadedGuide.updatedAt);
      setLoadState("ready");
    });
  }

  function reloadGuide() {
    setLoadState("loading");
    setSaveMessage(null);
    loadRequestedGuide(guideId, fixtureLoader).then(acceptGuide).catch(() => setLoadState("error"));
  }

  useEffect(() => {
    let active = true;
    loadRequestedGuide(guideId, fixtureLoader)
      .then((loadedGuide) => { if (active) acceptGuide(loadedGuide); })
      .catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, [fixtureLoader, guideId]);

  function commit(nextGuide: Guide) {
    if (nextGuide === guide) return;
    if (guide) setPast((history) => [...history.slice(-49), guide]);
    setFuture([]);
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

  function editSelectedStep(changes: Partial<Pick<GuideStep, "title" | "description" | "section" | "annotation">>) {
    if (guide && selectedStepId) commit(updateGuideStep(guide, selectedStepId, changes, guide.updatedAt + 1));
  }

  function editGuide(changes: Partial<GuideDetails>) {
    if (!guide) return;
    commit(updateGuideDetails(guide, {
      title: changes.title ?? guide.title,
      description: changes.description ?? guide.description,
      introduction: changes.introduction ?? guide.introduction,
      branding: changes.branding ?? guide.branding,
    }, guide.updatedAt + 1));
  }

  function undo() {
    if (!guide || past.length === 0) return;
    const previous = past.at(-1)!;
    setPast((history) => history.slice(0, -1));
    setFuture((history) => [guide, ...history].slice(0, 50));
    setGuide(previous);
    setUnsaved(true);
    setSaveMessage(null);
  }

  function redo() {
    if (!guide || future.length === 0) return;
    const next = future[0];
    setFuture((history) => history.slice(1));
    setPast((history) => [...history.slice(-49), guide]);
    setGuide(next);
    setUnsaved(true);
    setSaveMessage(null);
  }

  function addStep() {
    if (!guide) return;
    const stepId = crypto.randomUUID();
    commit(addGuideStep(guide, stepId, guide.updatedAt + 1));
    setSelectedStepId(stepId);
  }

  function duplicateStep() {
    if (!guide || !selectedStepId) return;
    const stepId = crypto.randomUUID();
    commit(duplicateGuideStep(guide, selectedStepId, stepId, guide.updatedAt + 1));
    setSelectedStepId(stepId);
  }

  function removeStep() {
    if (!guide || !selectedStepId) return;
    const index = guide.steps.findIndex((step) => step.id === selectedStepId);
    const nextGuide = deleteGuideStep(guide, selectedStepId, guide.updatedAt + 1);
    commit(nextGuide);
    setSelectedStepId(nextGuide.steps[Math.min(index, nextGuide.steps.length - 1)]?.id ?? null);
  }

  const persistGuide = useCallback(async (candidate: Guide, automatic = false) => {
    if (!guideId || savedRevision === null) {
      setUnsaved(false);
      setSaveMessage(automatic ? "Autosaved locally" : "Preview saved");
      return;
    }

    const write = {
      title: candidate.title,
      description: candidate.description,
      introduction: candidate.introduction,
      branding: candidate.branding,
      steps: candidate.steps,
    };
    setSaveMessage("Saving...");
    try {
      const response = await fetch(`/api/guides/${encodeURIComponent(guideId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updatedAt: savedRevision, guide: write }),
      });
      if (response.status === 409) {
        setSaveMessage("Conflict: reload before saving");
        return;
      }
      if (!response.ok) throw new Error("Guide save failed");
      const savedGuide = GuideSchema.parse(await response.json());
      setSavedRevision(savedGuide.updatedAt);
      if (guideRef.current?.updatedAt === candidate.updatedAt) {
        setGuide(savedGuide);
        setUnsaved(false);
        setSaveMessage(automatic ? "Autosaved" : "Draft saved");
      }
    } catch {
      setSaveMessage("Save failed - retry");
    }
  }, [guideId, savedRevision]);

  useEffect(() => {
    if (!guide || !guideId || !unsaved) return;
    const timer = window.setTimeout(() => { void persistGuide(guide, true); }, 900);
    return () => window.clearTimeout(timer);
  }, [guide, guideId, persistGuide, unsaved]);

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
        <button className="primary-button" type="button" onClick={reloadGuide}><RotateCcw size={16} /> Retry</button>
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
          <input id="guide-title" className="guide-title-input" value={guide.title} onChange={(event) => editGuide({ title: event.target.value })} />
          <label htmlFor="guide-description">Summary</label>
          <textarea id="guide-description" rows={2} value={guide.description} onChange={(event) => editGuide({ description: event.target.value })} />
          <label htmlFor="guide-introduction">Introduction</label>
          <textarea id="guide-introduction" rows={3} value={guide.introduction} onChange={(event) => editGuide({ introduction: event.target.value })} />
          <div className="branding-fields">
            <label>Brand name<input value={guide.branding.name} onChange={(event) => editGuide({ branding: { ...guide.branding, name: event.target.value } })} /></label>
            <label>Accent<input type="color" value={guide.branding.accentColor} onChange={(event) => editGuide({ branding: { ...guide.branding, accentColor: event.target.value } })} /></label>
          </div>
          <label htmlFor="brand-logo">Logo URL</label>
          <input id="brand-logo" value={guide.branding.logoUrl ?? ""} placeholder="https://..." onChange={(event) => editGuide({ branding: { ...guide.branding, logoUrl: event.target.value || null } })} />
        </div>
        <div className="steps-heading">
          <div><p className="eyebrow">Sequence</p><h2>{guide.steps.length} steps</h2></div>
          <button className="icon-button" type="button" title="Add step" aria-label="Add step" onClick={addStep}><Plus size={17} /></button>
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
            <button className="icon-button" type="button" title="Undo" aria-label="Undo" disabled={past.length === 0} onClick={undo}><Undo2 size={16} /></button>
            <button className="icon-button" type="button" title="Redo" aria-label="Redo" disabled={future.length === 0} onClick={redo}><Redo2 size={16} /></button>
            <button className="primary-button" type="button" disabled={!unsaved} onClick={() => { void persistGuide(guide); }}><Check size={16} /> Save draft</button>
            {identity && <AccountControl name={identity.name} role={identity.role} />}
          </div>
        </header>
        {selectedStep ? (
          <div className="editor-content">
            <div className="media-tools" aria-label="Media tools">
              <label><ZoomIn size={14} /> Zoom <input type="range" min="50" max="200" step="10" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /> <output>{zoom}%</output></label>
              <button type="button" onClick={duplicateStep}><Copy size={15} /> Duplicate</button>
              <button type="button" className="danger-button" onClick={removeStep}><Trash2 size={15} /> Delete</button>
            </div>
            <MediaCanvas step={selectedStep} zoom={zoom} />
            {selectedStep.media && <AnnotationEditor step={selectedStep} onChange={(annotation) => editSelectedStep({ annotation })} />}
            <section className="step-editor" aria-labelledby="step-editor-heading">
              <div className="section-title"><div><p className="eyebrow">Instruction</p><h2 id="step-editor-heading">What should the reader do?</h2></div><span>{selectedStep.title.length}/2000</span></div>
              <label htmlFor="step-title">Step title</label>
              <input id="step-title" value={selectedStep.title} onChange={(event) => editStep({ title: event.target.value, description: selectedStep.description })} />
              <label htmlFor="step-section">Section</label>
              <input id="step-section" value={selectedStep.section ?? ""} placeholder="Optional section heading" onChange={(event) => editSelectedStep({ section: event.target.value || null })} />
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

function MediaCanvas({ step, zoom }: { step: GuideStep; zoom: number }) {
  if (!step.media) return <section className="media-canvas media-canvas--empty"><FolderOpen size={26} /><strong>No media for this step</strong></section>;
  const annotation = step.annotation;
  return (
    <section className="media-section" aria-label="Step media">
      <div className="media-label"><span>Screenshot</span><span>{step.media.width} × {step.media.height}</span></div>
      <div className="media-canvas" style={{ aspectRatio: `${step.media.width} / ${step.media.height}` }}>
        <div className="media-zoom-layer" style={{ transform: `scale(${zoom / 100})` }}>
          <Image src={step.media.source} alt={step.media.alt} fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 70vw, 56vw" priority unoptimized={step.media.source.startsWith("/api/images/private")} />
          {annotation && !annotation.hidden && <span className="media-highlight" aria-label="Highlighted target" style={rectStyle(annotation.rect, step)} />}
          {annotation?.redactions.map((redaction) => <span key={redaction.id} className="media-redaction" aria-label="Redacted area" style={rectStyle(redaction.rect, step)} />)}
          {annotation?.crop && <span className="media-crop" aria-label="Crop boundary" style={rectStyle(annotation.crop, step)} />}
        </div>
      </div>
    </section>
  );
}

function rectStyle(rect: { x: number; y: number; width: number; height: number }, step: GuideStep) {
  return {
    left: `${(rect.x / step.media!.width) * 100}%`,
    top: `${(rect.y / step.media!.height) * 100}%`,
    width: `${(rect.width / step.media!.width) * 100}%`,
    height: `${(rect.height / step.media!.height) * 100}%`,
  };
}

function AnnotationEditor({ step, onChange }: {
  step: GuideStep;
  onChange: (annotation: NonNullable<GuideStep["annotation"]>) => void;
}) {
  const media = step.media!;
  const annotation = step.annotation ?? {
    rect: { x: media.width * .35, y: media.height * .35, width: media.width * .3, height: media.height * .15 },
    coordinateSpace: "image-pixels" as const,
    hidden: false,
    crop: null,
    redactions: [],
  };

  function changeRect(field: "x" | "y" | "width" | "height", value: number) {
    const maximum = field === "x" || field === "width" ? media.width : media.height;
    const minimum = field === "width" || field === "height" ? 1 : 0;
    onChange({ ...annotation, rect: { ...annotation.rect, [field]: Math.max(minimum, Math.min(maximum, value)) } });
  }

  function addRedaction() {
    onChange({
      ...annotation,
      redactions: [...annotation.redactions, {
        id: crypto.randomUUID(),
        rect: { x: media.width * .35, y: media.height * .4, width: media.width * .3, height: media.height * .08 },
      }],
    });
  }

  const geometryFields = ["x", "y", "width", "height"] as const;
  return (
    <section className="annotation-editor" aria-labelledby="annotation-heading">
      <div className="section-title"><div><p className="eyebrow">Privacy and focus</p><h2 id="annotation-heading">Image annotations</h2></div></div>
      <div className="annotation-actions">
        <button type="button" onClick={() => onChange({ ...annotation, hidden: !annotation.hidden })}>{annotation.hidden ? <Eye size={15} /> : <EyeOff size={15} />} {annotation.hidden ? "Show highlight" : "Hide highlight"}</button>
        <button type="button" onClick={() => onChange({ ...annotation, crop: annotation.crop ? null : { x: 0, y: 0, width: media.width, height: media.height } })}><Crop size={15} /> {annotation.crop ? "Clear crop" : "Set crop"}</button>
        <button type="button" onClick={addRedaction}><Shield size={15} /> Add redaction</button>
      </div>
      <fieldset className="geometry-fields"><legend>Highlight position and size</legend>{geometryFields.map((field) => <label key={field}>{field}<input aria-label={`Highlight ${field}`} type="number" min={field === "width" || field === "height" ? 1 : 0} value={Math.round(annotation.rect[field])} onChange={(event) => changeRect(field, Number(event.target.value))} /></label>)}</fieldset>
      {annotation.crop && <fieldset className="geometry-fields"><legend>Crop bounds</legend>{geometryFields.map((field) => <label key={field}>{field}<input aria-label={`Crop ${field}`} type="number" min={field === "width" || field === "height" ? 1 : 0} value={Math.round(annotation.crop![field])} onChange={(event) => onChange({ ...annotation, crop: { ...annotation.crop!, [field]: Number(event.target.value) } })} /></label>)}</fieldset>}
      {annotation.redactions.map((redaction, index) => (
        <div className="redaction-row" key={redaction.id}><strong>Redaction {index + 1}</strong>{geometryFields.map((field) => <label key={field}>{field}<input aria-label={`Redaction ${index + 1} ${field}`} type="number" min="0" value={Math.round(redaction.rect[field])} onChange={(event) => onChange({ ...annotation, redactions: annotation.redactions.map((item) => item.id === redaction.id ? { ...item, rect: { ...item.rect, [field]: Number(event.target.value) } } : item) })} /></label>)}<button className="icon-button" type="button" title="Remove redaction" aria-label={`Remove redaction ${index + 1}`} onClick={() => onChange({ ...annotation, redactions: annotation.redactions.filter((item) => item.id !== redaction.id) })}><Trash2 size={14} /></button></div>
      ))}
      <p className="privacy-note">Redactions remain editable here and are flattened irreversibly during export.</p>
    </section>
  );
}