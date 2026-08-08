import {
    CONTRACT_VERSION,
    RecordingRequestMessageSchema,
    type ActionCapture,
    type CaptureActionType,
    type CapturedStep,
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
import type {
    AttachScreenshot,
    ScreenshotAttachment,
    PreparedScreenshot,
    ScreenshotSource,
} from "./screenshot-capture";

const SCREENSHOT_PREVIEW_TTL_MS = 10_000;

interface RecordingMessageHandlerOptions {
    now?: () => number;
    createId?: () => string;
    attachScreenshot?: AttachScreenshot;
    prepareScreenshot?: (
        source: ScreenshotSource,
        settleDelayMs?: number,
    ) => Promise<PreparedScreenshot>;
    retryScreenshot?: (step: CapturedStep) => Promise<ScreenshotAttachment>;
    reportScreenshotError?: (error: unknown) => void;
    deleteScreenshot?: (storageKey: string) => Promise<void>;
    clearScreenshots?: () => Promise<void>;
}

export interface RecordingMessageSource {
    url?: string;
    tabId?: number;
    windowId?: number;
}

export function createRecordingMessageHandler(
    storage: RecordingStorage,
    options: RecordingMessageHandlerOptions = {},
): (
    message: unknown,
    source?: string | RecordingMessageSource,
) => Promise<RecordingResponseMessage> {
    const now = options.now ?? Date.now;
    const createId = options.createId ?? (() => crypto.randomUUID());
    const pendingScreenshots = new Map<number, Promise<{
        action: "click" | "select";
        candidate: PreparedScreenshot;
        capture: ActionCapture;
        expiresAt: number;
        url: string;
        windowId: number;
    } | null>>();
    let pending = Promise.resolve();

    return (message, source) => {
        const parsedMessage = RecordingRequestMessageSchema.safeParse(message);
        if (
            parsedMessage.success
            && (
                parsedMessage.data.type === "capture.click.preview"
                || parsedMessage.data.type === "capture.select.preview"
            )
        ) {
            return handleScreenshotPreview(
                storage,
                parsedMessage.data,
                source,
                now,
                options,
                pendingScreenshots,
            );
        }

        const response = pending.then(() =>
            handleRecordingMessage(
                storage,
                message,
                source,
                now,
                createId,
                options,
                pendingScreenshots,
            ),
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
    source: string | RecordingMessageSource | undefined,
    now: () => number,
    createId: () => string,
    options: RecordingMessageHandlerOptions,
    pendingScreenshots: Map<number, Promise<{
        action: "click" | "select";
        candidate: PreparedScreenshot;
        capture: ActionCapture;
        expiresAt: number;
        url: string;
        windowId: number;
    } | null>>,
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

        if (
            message.type === "capture.click"
            || message.type === "capture.input"
            || message.type === "capture.select"
            || message.type === "capture.submit"
        ) {
            const normalizedSource = normalizeSource(source);
            if (!isMatchingPageSource(normalizedSource.url, message.capture.url)) {
                return errorResponse(
                    message.requestId,
                    "INVALID_MESSAGE",
                    "The action capture source is invalid.",
                );
            }

            if (!currentSession || currentSession.status !== "recording") {
                return successResponse(message.requestId, currentSession);
            }

            const step = createCapturedStep(
                currentSession.id,
                currentSession.steps.length,
                message.type.slice("capture.".length) as CaptureActionType,
                message.capture,
                createId(),
            );
            const session = {
                ...currentSession,
                updatedAt: now(),
                steps: [...currentSession.steps, step],
            };
            await storage.save(session);

            const screenshotSource = toScreenshotSource(normalizedSource);
            if (!options.attachScreenshot || !screenshotSource) {
                return successResponse(message.requestId, session);
            }

            try {
                const action = message.type.slice("capture.".length) as CaptureActionType;
                const pendingScreenshotPromise = message.type === "capture.click"
                    || message.type === "capture.select"
                    ? pendingScreenshots.get(screenshotSource.tabId)
                    : undefined;
                if (pendingScreenshotPromise) {
                    pendingScreenshots.delete(screenshotSource.tabId);
                }
                const pendingScreenshot = await pendingScreenshotPromise;
                const prepared = pendingScreenshot
                    && pendingScreenshot.action === action
                    && pendingScreenshot.expiresAt >= now()
                    && pendingScreenshot.url === message.capture.url
                    && pendingScreenshot.windowId === screenshotSource.windowId
                    && isMatchingPreviewTarget(pendingScreenshot.capture, message.capture)
                    ? pendingScreenshot.candidate
                    : undefined;
                const attachment = await options.attachScreenshot(
                    step,
                    screenshotSource,
                    prepared,
                );
                const capturedStep = { ...step, ...attachment };
                const capturedSession = {
                    ...session,
                    updatedAt: now(),
                    steps: [...currentSession.steps, capturedStep],
                };
                await storage.save(capturedSession);
                return successResponse(message.requestId, capturedSession);
            } catch (error) {
                options.reportScreenshotError?.(error);
                return successResponse(message.requestId, session);
            }
        }

        if (message.type === "recording.import") {
            await storage.save(message.session);
            return successResponse(message.requestId, message.session);
        }

        if (
            message.type === "recording.step.update"
            || message.type === "recording.step.delete"
            || message.type === "recording.steps.reorder"
            || message.type === "recording.screenshot.retry"
        ) {
            if (!currentSession || currentSession.id !== message.sessionId) {
                return errorResponse(
                    message.requestId,
                    "SESSION_NOT_FOUND",
                    "The recording session was not found.",
                );
            }

            if (message.type === "recording.steps.reorder") {
                const stepsById = new Map(currentSession.steps.map((step) => [step.id, step]));
                const hasExactStepSet = message.stepIds.length === currentSession.steps.length
                    && new Set(message.stepIds).size === currentSession.steps.length
                    && message.stepIds.every((stepId) => stepsById.has(stepId));
                if (!hasExactStepSet) {
                    return errorResponse(
                        message.requestId,
                        "INVALID_MESSAGE",
                        "The reordered steps must contain every session step exactly once.",
                    );
                }

                const session = {
                    ...currentSession,
                    updatedAt: now(),
                    steps: message.stepIds.map((stepId, sequence) => ({
                        ...stepsById.get(stepId)!,
                        sequence,
                    })),
                };
                await storage.save(session);
                return successResponse(message.requestId, session);
            }

            const stepIndex = currentSession.steps.findIndex((step) => step.id === message.stepId);
            const currentStep = currentSession.steps[stepIndex];
            if (!currentStep) {
                return errorResponse(
                    message.requestId,
                    "STEP_NOT_FOUND",
                    "The captured step was not found.",
                );
            }

            if (message.type === "recording.step.update") {
                const steps = [...currentSession.steps];
                steps[stepIndex] = { ...currentStep, description: message.description };
                const session = { ...currentSession, updatedAt: now(), steps };
                await storage.save(session);
                return successResponse(message.requestId, session);
            }

            if (message.type === "recording.step.delete") {
                const steps = currentSession.steps
                    .filter((step) => step.id !== message.stepId)
                    .map((step, sequence) => ({ ...step, sequence }));
                const session = { ...currentSession, updatedAt: now(), steps };
                await storage.save(session);
                if (currentStep.screenshot?.storageKey) {
                    await options.deleteScreenshot?.(currentStep.screenshot.storageKey);
                }
                return successResponse(message.requestId, session);
            }

            if (!options.retryScreenshot) {
                return errorResponse(
                    message.requestId,
                    "SCREENSHOT_UNAVAILABLE",
                    "Screenshot capture is unavailable.",
                );
            }

            try {
                const attachment = await options.retryScreenshot(currentStep);
                const steps = [...currentSession.steps];
                steps[stepIndex] = { ...currentStep, ...attachment };
                const session = { ...currentSession, updatedAt: now(), steps };
                await storage.save(session);
                return successResponse(message.requestId, session);
            } catch (error) {
                return errorResponse(
                    message.requestId,
                    "SCREENSHOT_UNAVAILABLE",
                    error instanceof Error ? error.message : "The screenshot could not be captured.",
                );
            }
        }

        const transition = transitionRecordingState(
            currentSession,
            toStateCommand(message),
            now(),
            createId,
        );
        if (message.type === "recording.stop" || message.type === "recording.clear") {
            pendingScreenshots.clear();
        }
        if (transition.action === "clear") {
            await options.clearScreenshots?.();
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
        case "recording.step.update":
        case "recording.step.delete":
        case "recording.steps.reorder":
        case "recording.import":
        case "recording.screenshot.retry":
            throw new Error("Review messages do not transition recording state.");
        case "capture.click":
        case "capture.click.preview":
        case "capture.input":
        case "capture.select":
        case "capture.select.preview":
        case "capture.submit":
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
    code: "INVALID_MESSAGE" | "SESSION_NOT_FOUND" | "STEP_NOT_FOUND"
        | "SCREENSHOT_UNAVAILABLE" | "STORAGE_ERROR",
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
    action: CaptureActionType,
    capture: ActionCapture,
    id: string,
): CapturedStep {
    return {
        id,
        sessionId,
        sequence,
        action,
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

function normalizeSource(
    source: string | RecordingMessageSource | undefined,
): RecordingMessageSource {
    return typeof source === "string" ? { url: source } : (source ?? {});
}

function toScreenshotSource(source: RecordingMessageSource): ScreenshotSource | null {
    return source.tabId === undefined || source.windowId === undefined
        ? null
        : { tabId: source.tabId, windowId: source.windowId };
}

async function handleScreenshotPreview(
    storage: RecordingStorage,
    message: Extract<RecordingRequestMessage, {
        type: "capture.click.preview" | "capture.select.preview";
    }>,
    source: string | RecordingMessageSource | undefined,
    now: () => number,
    options: RecordingMessageHandlerOptions,
    pendingScreenshots: Map<number, Promise<{
        action: "click" | "select";
        candidate: PreparedScreenshot;
        capture: ActionCapture;
        expiresAt: number;
        url: string;
        windowId: number;
    } | null>>,
): Promise<RecordingResponseMessage> {
    const normalizedSource = normalizeSource(source);
    if (!isMatchingPageSource(normalizedSource.url, message.capture.url)) {
        return errorResponse(
            message.requestId,
            "INVALID_MESSAGE",
            "The action capture source is invalid.",
        );
    }

    const currentSession = await storage.load();
    const screenshotSource = toScreenshotSource(normalizedSource);
    if (
        currentSession?.status !== "recording"
        || !screenshotSource
        || !options.prepareScreenshot
    ) {
        return successResponse(message.requestId, currentSession);
    }

    const action: "click" | "select" = message.type === "capture.click.preview"
        ? "click"
        : "select";
    const settleDelayMs = action === "click" ? 0 : undefined;
    const candidatePromise = options.prepareScreenshot(screenshotSource, settleDelayMs).then(
        (candidate) => ({
            action,
            candidate,
            capture: message.capture,
            expiresAt: now() + SCREENSHOT_PREVIEW_TTL_MS,
            url: message.capture.url,
            windowId: screenshotSource.windowId,
        }),
        (error) => {
            options.reportScreenshotError?.(error);
            return null;
        },
    );
    pendingScreenshots.set(screenshotSource.tabId, candidatePromise);
    await candidatePromise;
    return successResponse(message.requestId, await storage.load());
}

function isMatchingPreviewTarget(preview: ActionCapture, action: ActionCapture): boolean {
    if (preview.element.tagName !== action.element.tagName) {
        return false;
    }

    const actionSelectors = new Set(action.element.selectors);
    return preview.element.selectors.some((selector) => actionSelectors.has(selector))
        || (
            preview.element.accessibleName !== undefined
            && preview.element.accessibleName === action.element.accessibleName
            && preview.element.role === action.element.role
        );
}