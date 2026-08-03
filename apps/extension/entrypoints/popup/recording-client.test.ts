import { describe, expect, it } from 'vitest';

import type { RecordingSession } from '../../utils/contracts';
import {
  classifyPageUrl,
  createRequest,
  formatDuration,
  getSessionDuration,
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

  it('formats live and stopped session durations', () => {
    expect(formatDuration(getSessionDuration(session, 66_000))).toBe('1:05');
    expect(
      getSessionDuration({ ...session, status: 'stopped', updatedAt: 5_000 }, 99_000),
    ).toBe(4_000);
    expect(formatDuration(3_661_000)).toBe('1:01:01');
  });
});