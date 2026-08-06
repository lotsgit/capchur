import { useEffect, useState, type FormEvent } from 'react';

import type {
  CapturedStep,
  ExtensionSyncStatus,
  RecordingRequestMessage,
  RecordingSession,
  SyncRequestMessage,
} from '../../utils/contracts';
import { createScreenshotStorage } from '../../utils/screenshot-storage';
import {
  createLocalSessionArchive,
  parseLocalSessionArchive,
  restoreLocalSessionScreenshots,
} from './local-session-archive';
import {
  clearReviewSession,
  deleteStep,
  importReviewSession,
  loadReviewSession,
  reorderSteps,
  retryStepScreenshot,
  updateStepDescription,
} from './review-client';
import {
  connectAndSync,
  enqueueSessionSync,
  loadSyncStatus,
  openSyncedGuide,
  retrySessionSync,
} from './sync-client';

const screenshotStorage = createScreenshotStorage();
const sendMessage = (message: RecordingRequestMessage): Promise<unknown> =>
  browser.runtime.sendMessage(message);
const sendSyncMessage = (message: SyncRequestMessage): Promise<unknown> =>
  browser.runtime.sendMessage(message);

type LoadState = 'loading' | 'ready' | 'error';

export default function App() {
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<ExtensionSyncStatus | null>(null);

  useEffect(() => {
    let active = true;
    loadReviewSession(sendMessage)
      .then((loadedSession) => {
        if (active) {
          setSession(loadedSession);
          setLoadState('ready');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(toErrorMessage(error));
          setLoadState('error');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadSyncStatus(sendSyncMessage)
      .then((status) => { if (active) setSyncStatus(status); })
      .catch((error: unknown) => { if (active) setErrorMessage(toErrorMessage(error)); });
    return () => { active = false; };
  }, []);

  async function runAction(
    action: string,
    operation: () => Promise<RecordingSession | null>,
    success?: string,
  ) {
    setBusyAction(action);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const nextSession = await operation();
      setSession(nextSession);
      if (nextSession?.status === 'stopped') {
        enqueueSessionSync(nextSession, sendSyncMessage)
          .then(setSyncStatus)
          .catch(() => undefined);
      }
      if (success) {
        setSuccessMessage(success);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function exportSession() {
    if (!session) {
      return;
    }
    setBusyAction('export');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const archive = await createLocalSessionArchive(
        session,
        (storageKey) => screenshotStorage.load(storageKey),
      );
      downloadJson(
        `capchur-session-${session.id}.json`,
        JSON.stringify(archive, null, 2),
      );
      setSuccessMessage('Session archive exported.');
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function runSyncAction(
    action: string,
    operation: () => Promise<ExtensionSyncStatus>,
  ) {
    setBusyAction(action);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const status = await operation();
      setSyncStatus(status);
      if (status.message) setSuccessMessage(status.message);
      else if (status.state === 'synced') setSuccessMessage('Session synced to your workspace.');
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function importSession(file: File) {
    const currentScreenshotKeys = getScreenshotKeys(session);
    setBusyAction('import');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const archive = parseLocalSessionArchive(await file.text());
      await restoreLocalSessionScreenshots(
        archive,
        (storageKey, dataUrl) => screenshotStorage.save(storageKey, dataUrl),
      );
      const importedSession = await importReviewSession(archive.session, sendMessage);
      const importedKeys = new Set(getScreenshotKeys(importedSession));
      await Promise.all(
        currentScreenshotKeys
          .filter((storageKey) => !importedKeys.has(storageKey))
          .map((storageKey) => screenshotStorage.delete(storageKey)),
      );
      setSession(importedSession);
      setSuccessMessage('Session archive imported.');
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  const isBusy = busyAction !== null;

  return (
    <main className="review-page">
      <header className="review-header">
        <div className="review-header__inner">
          <div>
            <div className="brand-line">
              <span className="brand-mark" aria-hidden="true">C</span>
              <div>
                <p className="eyebrow">Capchur</p>
                <h1>Session review</h1>
              </div>
            </div>
            <p className="session-meta">
              {session
                ? `${session.steps.length} ${session.steps.length === 1 ? 'step' : 'steps'} · ${formatStatus(session.status)}`
                : 'Local capture workspace'}
            </p>
          </div>

          <div className="toolbar" aria-busy={isBusy}>
            {syncStatus?.state === 'disconnected' && (
              <button
                type="button"
                disabled={!session || isBusy}
                onClick={() => session && void runSyncAction('connect', () => connectAndSync(session, sendSyncMessage))}
              >
                {busyAction === 'connect' ? 'Connecting & syncing...' : 'Connect & sync'}
              </button>
            )}
            {syncStatus?.connectedUserName && <span className="connection-confirmation">Connected as <strong>{syncStatus.connectedUserName}</strong></span>}
            {syncStatus?.state === 'retrying' && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void runSyncAction('retry-sync', () => retrySessionSync(sendSyncMessage))}
              >
                Retry sync
              </button>
            )}
            {syncStatus?.guideId && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  const guideId = syncStatus.guideId;
                  if (guideId) {
                    void runSyncAction(
                      'open-guide',
                      () => openSyncedGuide(guideId, sendSyncMessage),
                    );
                  }
                }}
              >
                Open guide
              </button>
            )}
            <button type="button" disabled={!session || isBusy} onClick={() => void exportSession()}>
              {busyAction === 'export' ? 'Exporting...' : 'Export JSON'}
            </button>
            <label className="import-button">
              {busyAction === 'import' ? 'Importing...' : 'Import JSON'}
              <input
                type="file"
                accept="application/json,.json"
                disabled={isBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) {
                    void importSession(file);
                  }
                }}
              />
            </label>
            {session && (
              <button
                type="button"
                className="danger-button"
                disabled={isBusy}
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    return;
                  }
                  setConfirmClear(false);
                  void runAction(
                    'clear',
                    () => clearReviewSession(session.id, sendMessage),
                    'Session cleared.',
                  );
                }}
              >
                {busyAction === 'clear'
                  ? 'Clearing...'
                  : confirmClear
                    ? 'Confirm clear'
                    : 'Clear session'}
              </button>
            )}
            {confirmClear && (
              <button type="button" disabled={isBusy} onClick={() => setConfirmClear(false)}>
                Keep session
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="review-content">
        {errorMessage && <div className="notice" role="alert">{errorMessage}</div>}
        {successMessage && <div className="notice notice--success" role="status">{successMessage}</div>}
        {syncStatus?.state === 'conflict' && (
          <div className="notice" role="alert">
            {syncStatus.message ?? 'A newer cloud revision exists. Edit the local session before retrying.'}
          </div>
        )}

        {loadState === 'loading' && (
          <div className="loading-state" role="status">Loading local session...</div>
        )}

        {loadState !== 'loading' && !session && (
          <section className="empty-state">
            <h2>No local session</h2>
            <p>Record a workflow from the extension popup or import a Capchur JSON archive.</p>
          </section>
        )}

        {session && session.steps.length === 0 && (
          <section className="empty-state">
            <h2>No captured steps yet</h2>
            <p>Resume recording from the popup, then return here to review the session.</p>
          </section>
        )}

        {session && session.steps.length > 0 && (
          <ol className="steps">
            {session.steps.map((step, index) => (
              <StepCard
                key={step.id}
                step={step}
                index={index}
                total={session.steps.length}
                busy={isBusy}
                onRename={(description) => runAction(
                  `rename-${step.id}`,
                  () => updateStepDescription(session.id, step.id, description, sendMessage),
                )}
                onDelete={() => runAction(
                  `delete-${step.id}`,
                  () => deleteStep(session.id, step.id, sendMessage),
                )}
                onMove={(direction) => {
                  const destination = index + direction;
                  const stepIds = session.steps.map(({ id }) => id);
                  const movingStepId = stepIds[index];
                  const displacedStepId = stepIds[destination];
                  if (!movingStepId || !displacedStepId) {
                    return Promise.resolve();
                  }
                  stepIds[index] = displacedStepId;
                  stepIds[destination] = movingStepId;
                  return runAction(
                    `move-${step.id}`,
                    () => reorderSteps(session.id, stepIds, sendMessage),
                  );
                }}
                onRetry={() => runAction(
                  `retry-${step.id}`,
                  async () => {
                    const sourceUrl = new URL(step.url);
                    const granted = await browser.permissions.request({
                      origins: [`${sourceUrl.protocol}//${sourceUrl.hostname}/*`],
                    });
                    if (!granted) {
                      throw new Error('Page access was denied. The screenshot was not retried.');
                    }
                    return retryStepScreenshot(session.id, step.id, sendMessage);
                  },
                  'Screenshot captured from the source page.',
                )}
              />
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}

interface StepCardProps {
  step: CapturedStep;
  index: number;
  total: number;
  busy: boolean;
  onRename(description: string): Promise<void>;
  onDelete(): Promise<void>;
  onMove(direction: -1 | 1): Promise<void>;
  onRetry(): Promise<void>;
}

function StepCard({ step, index, total, busy, onRename, onDelete, onMove, onRetry }: StepCardProps) {
  const [description, setDescription] = useState(step.description);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setDescription(step.description), [step.description]);

  function submitDescription(event: FormEvent) {
    event.preventDefault();
    const normalizedDescription = description.trim();
    if (normalizedDescription && normalizedDescription !== step.description) {
      void onRename(normalizedDescription);
    }
  }

  return (
    <li className="step-card">
      <ScreenshotPreview step={step} />
      <div className="step-details">
        <div className="step-heading">
          <div>
            <p className="step-kicker">Step {index + 1}</p>
            <h2>{step.description}</h2>
          </div>
          <time className="timestamp" dateTime={new Date(step.timestamp).toISOString()}>
            {formatTimestamp(step.timestamp)}
          </time>
        </div>

        <form className="description-form" onSubmit={submitDescription}>
          <label htmlFor={`description-${step.id}`}>Description</label>
          <div className="description-row">
            <input
              id={`description-${step.id}`}
              value={description}
              maxLength={2_000}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
            />
            <button
              type="submit"
              disabled={busy || !description.trim() || description.trim() === step.description}
            >
              Save
            </button>
          </div>
        </form>

        <div className="source">
          <strong title={step.pageTitle}>{step.pageTitle || 'Untitled page'}</strong>
          <a href={step.url} target="_blank" rel="noreferrer" title={step.url}>{step.url}</a>
        </div>

        <div className="step-actions">
          <button type="button" disabled={busy || index === 0} onClick={() => void onMove(-1)}>
            Move up
          </button>
          <button type="button" disabled={busy || index === total - 1} onClick={() => void onMove(1)}>
            Move down
          </button>
          <button type="button" disabled={busy} onClick={() => void onRetry()}>
            Retry screenshot
          </button>
          <button
            type="button"
            className="delete-button"
            disabled={busy}
            onClick={() => {
              if (confirmDelete) {
                setConfirmDelete(false);
                void onDelete();
              } else {
                setConfirmDelete(true);
              }
            }}
          >
            {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
          {confirmDelete && (
            <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
              Keep step
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ScreenshotPreview({ step }: { step: CapturedStep }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const storageKey = step.screenshot?.storageKey;

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setImageUrl(null);

    if (storageKey) {
      screenshotStorage.load(storageKey).then((image) => {
        if (active && image) {
          objectUrl = URL.createObjectURL(image);
          setImageUrl(objectUrl);
        }
      }).catch(() => undefined);
    }

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [storageKey, step.screenshot?.capturedAt]);

  const screenshot = step.screenshot;
  const highlight = screenshot && !step.highlight.hidden
    ? {
        left: `${(step.highlight.rect.x / screenshot.width) * 100}%`,
        top: `${(step.highlight.rect.y / screenshot.height) * 100}%`,
        width: `${(step.highlight.rect.width / screenshot.width) * 100}%`,
        height: `${(step.highlight.rect.height / screenshot.height) * 100}%`,
      }
    : null;

  return (
    <div
      className="step-media"
      style={{ aspectRatio: screenshot ? `${screenshot.width} / ${screenshot.height}` : '16 / 9' }}
    >
      {imageUrl ? (
        <>
          <img src={imageUrl} alt={`Screenshot for ${step.description}`} />
          {highlight && <span className="highlight" style={highlight} aria-hidden="true" />}
        </>
      ) : (
        <div className="media-empty">
          <strong>{screenshot ? 'Screenshot unavailable' : 'No screenshot captured'}</strong>
          <span>Open the source page in a tab, then retry.</span>
        </div>
      )}
    </div>
  );
}

function getScreenshotKeys(session: RecordingSession | null): string[] {
  return session?.steps.flatMap((step) =>
    step.screenshot?.storageKey ? [step.screenshot.storageKey] : [],
  ) ?? [];
}

function formatStatus(status: RecordingSession['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

function downloadJson(filename: string, json: string) {
  const objectUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}
