import { useEffect, useState } from 'react';
import './App.css';

import type { RecordingSession } from '../../utils/contracts';
import {
  classifyPageUrl,
  formatDuration,
  getSessionDuration,
  runRecordingCommand,
  type PageAvailability,
  type RecordingCommand,
} from './recording-client';

type LoadState = 'loading' | 'ready' | 'error';

const statusLabels: Record<RecordingSession['status'], string> = {
  recording: 'Recording',
  paused: 'Paused',
  stopped: 'Stopped',
};

function App() {
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [busyCommand, setBusyCommand] = useState<RecordingCommand | null>(null);
  const [pageAvailability, setPageAvailability] = useState<PageAvailability | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let active = true;

    async function loadPopup() {
      try {
        const [persistedSession, availability] = await Promise.all([
          runRecordingCommand('open-session', null, (message) =>
            browser.runtime.sendMessage(message),
          ),
          browser.tabs
            .query({ active: true, currentWindow: true })
            .then((tabs) => classifyPageUrl(tabs[0]?.url))
            .catch(() => classifyPageUrl(undefined)),
        ]);

        if (active) {
          setSession(persistedSession);
          setPageAvailability(availability);
          setLoadState('ready');
        }
      } catch (error) {
        if (active) {
          setErrorMessage(toErrorMessage(error));
          setLoadState('error');
        }
      }
    }

    void loadPopup();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session?.status !== 'recording') {
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [session?.status]);

  async function runCommand(command: Exclude<RecordingCommand, 'open-session'>) {
    setBusyCommand(command);
    setErrorMessage(null);
    setConfirmClear(false);

    try {
      const nextSession = await runRecordingCommand(command, session, (message) =>
        browser.runtime.sendMessage(message),
      );
      setSession(nextSession);
      setNow(Date.now());
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyCommand(null);
    }
  }

  const pageBlocked = pageAvailability?.status !== 'available';
  const isBusy = busyCommand !== null;

  if (loadState === 'loading') {
    return (
      <main className="popup popup--centered" aria-busy="true">
        <div className="loading-mark" aria-hidden="true" />
        <p className="loading-label" role="status">Opening session...</p>
      </main>
    );
  }

  return (
    <main className="popup">
      <header className="masthead">
        <span className="brand-mark" aria-hidden="true">C</span>
        <div>
          <p className="eyebrow">Capchur</p>
          <h1>{session ? statusLabels[session.status] : 'Ready to record'}</h1>
        </div>
        <span
          className={`status-dot ${session?.status === 'recording' ? 'status-dot--live' : ''}`}
          aria-hidden="true"
        />
      </header>

      {session ? (
        <section className="session-summary" aria-label="Recording summary">
          <div>
            <span>Duration</span>
            <strong>{formatDuration(getSessionDuration(session, now))}</strong>
          </div>
          <div>
            <span>Steps</span>
            <strong>{session.steps.length}</strong>
          </div>
        </section>
      ) : (
        <p className="empty-copy">
          Capture a browser workflow one clear step at a time.
        </p>
      )}

      {pageAvailability && pageAvailability.status !== 'available' && (
        <div className={`notice notice--${pageAvailability.status}`} role="status">
          <strong>
            {pageAvailability.status === 'permission-denied'
              ? 'Tab access needed'
              : 'Page unavailable'}
          </strong>
          <p>{pageAvailability.message}</p>
        </div>
      )}

      {(loadState === 'error' || errorMessage) && (
        <div className="notice notice--error" role="alert">
          <strong>Something went wrong</strong>
          <p>{errorMessage ?? 'The recording session could not be opened.'}</p>
        </div>
      )}

      <div className="actions" aria-busy={isBusy}>
        {!session && (
          <button
            className="button button--primary"
            type="button"
            disabled={isBusy || pageBlocked}
            onClick={() => void runCommand('start')}
          >
            {busyCommand === 'start' ? 'Starting...' : 'Start recording'}
          </button>
        )}

        {session?.status === 'recording' && (
          <button
            className="button button--stop"
            type="button"
            disabled={isBusy}
            onClick={() => void runCommand('stop')}
          >
            {busyCommand === 'stop' ? 'Stopping...' : 'Stop recording'}
          </button>
        )}

        {session && session.status !== 'recording' && (
          <button
            className="button button--primary"
            type="button"
            disabled={isBusy || pageBlocked}
            onClick={() => void runCommand('resume')}
          >
            {busyCommand === 'resume' ? 'Resuming...' : 'Resume recording'}
          </button>
        )}

        {session && (
          <button
            className={`button button--quiet ${confirmClear ? 'button--confirm' : ''}`}
            type="button"
            disabled={isBusy}
            onClick={() => {
              if (confirmClear) {
                void runCommand('clear');
              } else {
                setConfirmClear(true);
              }
            }}
          >
            {busyCommand === 'clear'
              ? 'Clearing...'
              : confirmClear
                ? 'Confirm clear session'
                : 'Clear session'}
          </button>
        )}
      </div>

      {confirmClear && (
        <button
          className="cancel-clear"
          type="button"
          onClick={() => setConfirmClear(false)}
        >
          Keep session
        </button>
      )}
    </main>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

export default App;
