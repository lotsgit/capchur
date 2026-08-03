import {
    CONTRACT_VERSION,
    RecordingRequestMessageSchema,
    type CapturedStep,
    type ClickCapture,
    type RecordingRequestMessage,
    type RecordingResponseMessage,
    type RecordingSession,
} from "./contracts";
import {
    RecordingStateError,
    transitionRecordingState,
    type RecordingStateCommand,
} from "./recording-state";
import type { RecordingStorage } from "./recording-storage";

interface RecordingMessageHandlerOptions {
    now?: () => number;
    createId?: () => string;
}

export function createRecordingMessageHandler(
    storage: RecordingStorage,
    options: RecordingMessageHandlerOptions = {},
): (message: unknown, sourceUrl?: string) => Promise<RecordingResponseMessage> {
    const now = options.now ?? Date.now;
    const createId = options.createId ?? (() => crypto.randomUUID());
    let pending = Promise.resolve();

    return (message, sourceUrl) => {
        const response = pending.then(() =>
            handleRecordingMessage(storage, message, sourceUrl, now, createId),
        );
        pending = response.then(
            () => undefined,
            () => undefined,
        );
        return response;
    };
}

async function handleRecordingMessage(
    storage: RecordingStorage,
    untrustedMessage: unknown,
    sourceUrl: string | undefined,
    now: () => number,
    createId: () => string,
): Promise<RecordingResponseMessage> {
    const parsedMessage = RecordingRequestMessageSchema.safeParse(untrustedMessage);
    if (!parsedMessage.success) {
        return errorResponse(crypto.randomUUID(), "INVALID_MESSAGE", "The recording command is invalid.");
    }

    const message = parsedMessage.data;
    try {
        const currentSession = await storage.load();
        if (message.type === "recording.status") {
            return successResponse(message.requestId, currentSession);
        }

        if (message.type === "capture.click") {
            if (!isMatchingPageSource(sourceUrl, message.capture.url)) {
                return errorResponse(
                    message.requestId,
                    "INVALID_MESSAGE",
                    "The click capture source is invalid.",
                );
            }

            if (!currentSession || currentSession.status !== "recording") {
                return successResponse(message.requestId, currentSession);
            }

            const step = createCapturedStep(
                currentSession.id,
                currentSession.steps.length,
                message.capture,
                createId(),
            );
            const session = {
                ...currentSession,
                updatedAt: now(),
                steps: [...currentSession.steps, step],
            };
            await storage.save(session);
            return successResponse(message.requestId, session);
        }

        const transition = transitionRecordingState(
            currentSession,
            toStateCommand(message),
            now(),
            createId,
        );
        if (transition.action === "clear") {
            await storage.clear();
        } else {
            await storage.save(transition.session);
        }

        return successResponse(message.requestId, transition.session);
    } catch (error) {
        if (error instanceof RecordingStateError) {
            return errorResponse(message.requestId, error.code, error.message);
        }

        return errorResponse(
            message.requestId,
            "STORAGE_ERROR",
            "The recording state could not be persisted.",
        );
    }
}

function toStateCommand(message: RecordingRequestMessage): RecordingStateCommand {
    switch (message.type) {
        case "recording.start":
            return { type: "start" };
        case "recording.stop":
            return { type: "stop", sessionId: message.sessionId };
        case "recording.resume":
            return { type: "resume", sessionId: message.sessionId };
        case "recording.clear":
            return { type: "clear", sessionId: message.sessionId };
        case "recording.status":
            throw new Error("Status messages do not transition recording state.");
        case "capture.click":
            throw new Error("Capture messages do not transition recording state.");
    }
}

function successResponse(
    requestId: string,
    session: RecordingSession | null,
): RecordingResponseMessage {
    return {
        version: CONTRACT_VERSION,
        type: "recording.response",
        requestId,
        ok: true,
        session,
    };
}

function errorResponse(
    requestId: string,
    code: "INVALID_MESSAGE" | "SESSION_NOT_FOUND" | "STORAGE_ERROR",
    message: string,
): RecordingResponseMessage {
    return {
        version: CONTRACT_VERSION,
        type: "recording.response",
        requestId,
        ok: false,
        error: { code, message },
    };
}

function createCapturedStep(
    sessionId: string,
    sequence: number,
    capture: ClickCapture,
    id: string,
): CapturedStep {
    return {
        id,
        sessionId,
        sequence,
        action: "click",
        ...capture,
        screenshot: null,
    };
}

function isMatchingPageSource(sourceUrl: string | undefined, captureUrl: string): boolean {
    if (!sourceUrl) {
        return false;
    }

    try {
        const source = new URL(sourceUrl);
        const capture = new URL(captureUrl);
        return (
            (source.protocol === "http:" || source.protocol === "https:") &&
            source.href === capture.href
        );
    } catch {
        return false;
    }
}