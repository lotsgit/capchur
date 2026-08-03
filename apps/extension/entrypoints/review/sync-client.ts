import {
  CONTRACT_VERSION,
  SyncResponseMessageSchema,
  type ExtensionSyncStatus,
  type RecordingSession,
  type SyncRequestMessage,
} from '../../utils/contracts';

type SendMessage = (message: SyncRequestMessage) => Promise<unknown>;
type WithoutEnvelope<Message> = Message extends SyncRequestMessage
  ? Omit<Message, 'version' | 'requestId'>
  : never;
type SyncRequestInput = WithoutEnvelope<SyncRequestMessage>;

async function sendSyncRequest(
  message: SyncRequestInput,
  sendMessage: SendMessage,
): Promise<ExtensionSyncStatus> {
  const request = {
    ...message,
    version: CONTRACT_VERSION,
    requestId: crypto.randomUUID(),
  } as SyncRequestMessage;
  const response = SyncResponseMessageSchema.safeParse(await sendMessage(request));
  if (!response.success || response.data.requestId !== request.requestId) {
    throw new Error('The extension returned an invalid sync response.');
  }
  if (!response.data.ok) {
    throw new Error(response.data.status.message ?? 'Sync failed.');
  }
  return response.data.status;
}

export function loadSyncStatus(sendMessage: SendMessage) {
  return sendSyncRequest({ type: 'sync.status' }, sendMessage);
}

export function authorizeSync(sendMessage: SendMessage) {
  return sendSyncRequest({ type: 'sync.authorize' }, sendMessage);
}

export function enqueueSessionSync(session: RecordingSession, sendMessage: SendMessage) {
  return sendSyncRequest({ type: 'sync.enqueue', session }, sendMessage);
}

export function retrySessionSync(sendMessage: SendMessage) {
  return sendSyncRequest({ type: 'sync.retry' }, sendMessage);
}

export function openSyncedGuide(guideId: string, sendMessage: SendMessage) {
  return sendSyncRequest({ type: 'sync.open', guideId }, sendMessage);
}