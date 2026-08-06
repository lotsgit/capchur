import {
  CONTRACT_VERSION,
  RecordingResponseMessageSchema,
  type RecordingRequestMessage,
  type RecordingSession,
} from '../../utils/contracts';

export type RecordingCommand = 'open-session' | 'start' | 'stop' | 'resume' | 'clear';
export type PageAvailability =
  | { status: 'available' }
  | { status: 'permission-denied'; message: string }
  | { status: 'unavailable'; message: string };
export interface ActivePage {
  tabId: number;
  url: string;
}

interface CurrentTab {
  active: boolean;
  url?: string;
}

type SendMessage = (message: RecordingRequestMessage) => Promise<unknown>;

const unavailableProtocols = new Set([
  'about:',
  'chrome:',
  'chrome-extension:',
  'edge:',
  'moz-extension:',
  'view-source:',
]);

export async function runRecordingCommand(
  command: RecordingCommand,
  session: RecordingSession | null,
  sendMessage: SendMessage,
): Promise<RecordingSession | null> {
  const requestId = crypto.randomUUID();
  const message = createRequest(command, session, requestId);
  const response = RecordingResponseMessageSchema.safeParse(
    await sendMessage(message),
  );

  if (!response.success || response.data.requestId !== requestId) {
    throw new Error('The extension returned an invalid recording response.');
  }

  if (!response.data.ok) {
    throw new Error(response.data.error.message);
  }

  return response.data.session;
}

export function createRequest(
  command: RecordingCommand,
  session: RecordingSession | null,
  requestId: string,
): RecordingRequestMessage {
  if (command === 'open-session') {
    return { version: CONTRACT_VERSION, type: 'recording.status', requestId };
  }

  if (command === 'start') {
    return { version: CONTRACT_VERSION, type: 'recording.start', requestId };
  }

  if (!session) {
    throw new Error('There is no recording session to update.');
  }

  return {
    version: CONTRACT_VERSION,
    type: `recording.${command}`,
    requestId,
    sessionId: session.id,
  };
}

export function classifyPageUrl(url: string | undefined): PageAvailability {
  if (!url) {
    return {
      status: 'permission-denied',
      message: 'Capchur cannot access this tab. Open the extension again to grant access.',
    };
  }

  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return { status: 'unavailable', message: 'This page cannot be recorded.' };
  }

  if (unavailableProtocols.has(protocol) || (protocol !== 'http:' && protocol !== 'https:')) {
    return {
      status: 'unavailable',
      message: 'Browser and extension pages cannot be recorded. Open a website to continue.',
    };
  }

  return { status: 'available' };
}

export function getSessionDuration(session: RecordingSession, now: number): number {
  const end = session.status === 'recording' ? now : session.updatedAt;
  return Math.max(0, end - session.startedAt);
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function getPageOriginPattern(url: string): string {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('This page cannot be recorded.');
  }

  return `${parsedUrl.protocol}//${parsedUrl.hostname}/*`;
}

export async function enablePageAccess(
  page: ActivePage,
  requestPermission: (origin: string) => Promise<boolean>,
  getTab: (tabId: number) => Promise<CurrentTab>,
  injectContentScript: (tabId: number) => Promise<void>,
): Promise<void> {
  const origin = getPageOriginPattern(page.url);
  const granted = await requestPermission(origin);
  if (!granted) {
    throw new Error('Page access was denied.');
  }

  const currentTab = await getTab(page.tabId);
  if (!currentTab.active || !currentTab.url || getPageOriginPattern(currentTab.url) !== origin) {
    throw new Error('The active tab changed. Open Capchur on the page you want to record.');
  }

  await injectContentScript(page.tabId);
}