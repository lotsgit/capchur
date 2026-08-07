import { describe, expect, it, vi } from 'vitest';

import type { RecordingSession } from '../../utils/contracts';
import {
  classifyPageUrl,
  createRequest,
  enablePageAccess,
  formatDuration,
  getPageOriginPattern,
  getSessionDuration,
  RECORDING_ORIGIN_PATTERNS,
  runRecordingCommand,
} from './recording-client';

const requestId = '0198f1d0-c184-7000-8000-000000000001';
const session: RecordingSession = {
  id: '0198f1d0-c184-7000-8000-000000000002',
  status: 'recording',
  startedAt: 1_000,
  updatedAt: 2_000,
  steps: [],
};

describe('popup recording client', () => {
  it('maps open, start, and session commands to typed requests', () => {
    expect(createRequest('open-session', null, requestId).type).toBe('recording.status');
    expect(createRequest('start', null, requestId).type).toBe('recording.start');
    expect(createRequest('stop', session, requestId)).toMatchObject({
      type: 'recording.stop',
      sessionId: session.id,
    });
    expect(createRequest('resume', session, requestId).type).toBe('recording.resume');
    expect(createRequest('clear', session, requestId).type).toBe('recording.clear');
  });

  it('requires an existing session for session commands', () => {
    expect(() => createRequest('stop', null, requestId)).toThrow(
      'There is no recording session to update.',
    );
  });

  it('validates successful responses before returning the session', async () => {
    const result = await runRecordingCommand('start', null, async (message) => ({
      version: 1,
      type: 'recording.response',
      requestId: message.requestId,
      ok: true,
      session,
    }));

    expect(result).toEqual(session);
  });

  it('rejects malformed responses from the extension boundary', async () => {
    await expect(
      runRecordingCommand('open-session', null, async () => ({ ok: true })),
    ).rejects.toThrow('invalid recording response');
  });

  it('classifies supported, unavailable, and inaccessible pages', () => {
    expect(classifyPageUrl('https://example.com')).toEqual({ status: 'available' });
    expect(classifyPageUrl('chrome://extensions')).toMatchObject({ status: 'unavailable' });
    expect(classifyPageUrl(undefined)).toMatchObject({ status: 'permission-denied' });
  });

  it('creates the minimum host pattern for the active page origin', () => {
    expect(getPageOriginPattern('https://example.com:8443/settings?tab=team')).toBe(
      'https://example.com/*',
    );
    expect(() => getPageOriginPattern('chrome://extensions')).toThrow(
      'cannot be recorded',
    );
  });

  it('requests Firefox page permission before checking and injecting the tab', async () => {
    const calls: string[] = [];

    await enablePageAccess(
      { tabId: 42, url: 'https://example.com/settings' },
      async (origins) => {
        calls.push(`permission:${origins.join(',')}`);
        return true;
      },
      async (tabId) => {
        calls.push(`tab:${tabId}`);
        return { active: true, url: 'https://example.com/dashboard' };
      },
      async (tabId) => {
        calls.push(`inject:${tabId}`);
      },
    );

    expect(calls).toEqual([
      'permission:<all_urls>',
      'tab:42',
      'inject:42',
    ]);
  });

  it('requests optional all-sites access so popup windows can be captured', () => {
    expect(RECORDING_ORIGIN_PATTERNS).toEqual(['<all_urls>']);
  });

  it('does not inspect or inject the tab when page permission is denied', async () => {
    const getTab = vi.fn();
    const injectContentScript = vi.fn();

    await expect(enablePageAccess(
      { tabId: 42, url: 'https://example.com/settings' },
      async () => false,
      getTab,
      injectContentScript,
    )).rejects.toThrow('Page access was denied');

    expect(getTab).not.toHaveBeenCalled();
    expect(injectContentScript).not.toHaveBeenCalled();
  });

  it('formats live and stopped session durations', () => {
    expect(formatDuration(getSessionDuration(session, 66_000))).toBe('1:05');
    expect(
      getSessionDuration({ ...session, status: 'stopped', updatedAt: 5_000 }, 99_000),
    ).toBe(4_000);
    expect(formatDuration(3_661_000)).toBe('1:01:01');
  });
});