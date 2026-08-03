import {
    CONTRACT_VERSION,
    RecordingResponseMessageSchema,
    type RecordingRequestMessage,
    type RecordingSession,
} from '../../utils/contracts';

type SendMessage = (message: RecordingRequestMessage) => Promise<unknown>;

export function loadReviewSession(sendMessage: SendMessage): Promise<RecordingSession | null> {
    return sendReviewRequest({
        version: CONTRACT_VERSION,
        type: 'recording.status',
        requestId: crypto.randomUUID(),
    }, sendMessage);
}

export function updateStepDescription(
    sessionId: string,
    stepId: string,
    description: string,
    sendMessage: SendMessage,
): Promise<RecordingSession | null> {
    return sendReviewRequest({
        version: CONTRACT_VERSION,
        type: 'recording.step.update',
        requestId: crypto.randomUUID(),
        sessionId,
        stepId,
        description,
    }, sendMessage);
}

export function deleteStep(
    sessionId: string,
    stepId: string,
    sendMessage: SendMessage,
): Promise<RecordingSession | null> {
    return sendReviewRequest({
        version: CONTRACT_VERSION,
        type: 'recording.step.delete',
        requestId: crypto.randomUUID(),
        sessionId,
        stepId,
    }, sendMessage);
}

export function reorderSteps(
    sessionId: string,
    stepIds: string[],
    sendMessage: SendMessage,
): Promise<RecordingSession | null> {
    return sendReviewRequest({
        version: CONTRACT_VERSION,
        type: 'recording.steps.reorder',
        requestId: crypto.randomUUID(),
        sessionId,
        stepIds,
    }, sendMessage);
}

export function retryStepScreenshot(
    sessionId: string,
    stepId: string,
    sendMessage: SendMessage,
): Promise<RecordingSession | null> {
    return sendReviewRequest({
        version: CONTRACT_VERSION,
        type: 'recording.screenshot.retry',
        requestId: crypto.randomUUID(),
        sessionId,
        stepId,
    }, sendMessage);
}

export function importReviewSession(
    session: RecordingSession,
    sendMessage: SendMessage,
): Promise<RecordingSession | null> {
    return sendReviewRequest({
        version: CONTRACT_VERSION,
        type: 'recording.import',
        requestId: crypto.randomUUID(),
        session,
    }, sendMessage);
}

export function clearReviewSession(
    sessionId: string,
    sendMessage: SendMessage,
): Promise<RecordingSession | null> {
    return sendReviewRequest({
        version: CONTRACT_VERSION,
        type: 'recording.clear',
        requestId: crypto.randomUUID(),
        sessionId,
    }, sendMessage);
}

async function sendReviewRequest(
    message: RecordingRequestMessage,
    sendMessage: SendMessage,
): Promise<RecordingSession | null> {
    const response = RecordingResponseMessageSchema.safeParse(await sendMessage(message));
    if (!response.success || response.data.requestId !== message.requestId) {
        throw new Error('The extension returned an invalid session response.');
    }
    if (!response.data.ok) {
        throw new Error(response.data.error.message);
    }
    return response.data.session;
}
