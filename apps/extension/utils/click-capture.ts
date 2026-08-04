import {
    analyzeElement,
    type SupportedCaptureAction,
} from "@capchur/capture-core";
import {
    CONTRACT_VERSION,
    RecordingRequestMessageSchema,
    type RecordingRequestMessage,
} from "@capchur/contracts";

type SendMessage = (message: RecordingRequestMessage) => Promise<unknown>;

const recentEvents = new WeakSet<Event>();
const installationKey = "__capchurClickCaptureInstalledV1";

interface CaptureInstallationState {
    sendMessage: SendMessage;
}

export function installClickCapture(targetWindow: Window, sendMessage: SendMessage): void {
    const installationState = targetWindow as Window & Record<string, unknown>;
    const existingState = installationState[installationKey];
    if (isCaptureInstallationState(existingState)) {
        existingState.sendMessage = sendMessage;
        return;
    }

    const state: CaptureInstallationState = { sendMessage };
    installationState[installationKey] = state;
    const capture = (event: Event, action: SupportedCaptureAction): void => {
        if (recentEvents.has(event)) {
            return;
        }
        recentEvents.add(event);

        const message = createActionCaptureMessage(event, targetWindow, action);
        if (message) {
            void state.sendMessage(message).catch(() => undefined);
        }
    };

    targetWindow.addEventListener("click", (event) => capture(event, "click"), { capture: true });
    targetWindow.addEventListener("change", (event) => {
        const target = getEventElement(event);
        if (target?.matches("select")) {
            capture(event, "select");
        } else if (target?.matches("textarea, input:not([type]), input[type='text'], input[type='search'], input[type='email'], input[type='url'], input[type='tel'], input[type='number'], input[type='date'], input[type='time'], input[type='month'], input[type='week']")) {
            capture(event, "input");
        }
    }, { capture: true });
    targetWindow.addEventListener("submit", (event) => capture(event, "submit"), { capture: true });
}

export function createClickCaptureMessage(
    event: Event,
    targetWindow: Window,
): RecordingRequestMessage | null {
    return createActionCaptureMessage(event, targetWindow, "click");
}

export function createActionCaptureMessage(
    event: Event,
    targetWindow: Window,
    action: SupportedCaptureAction,
): RecordingRequestMessage | null {
    const element = getEventElement(event);
    if (!element || element.closest("[data-capchur-ui]") || !isVisible(element, targetWindow)) {
        return null;
    }

    if (action === "click" && element.closest("select, textarea, input:not([type='checkbox']):not([type='radio']), button[type='submit'], input[type='submit']")) {
        return null;
    }

    const analysis = analyzeElement(element, action);
    if (!analysis.supported) {
        return null;
    }

    const rect = element.getBoundingClientRect();
    const visualViewport = targetWindow.visualViewport;
    const message = {
        version: CONTRACT_VERSION,
        type: `capture.${action}`,
        requestId: crypto.randomUUID(),
        capture: {
            timestamp: Date.now(),
            url: targetWindow.location.href,
            pageTitle: targetWindow.document.title,
            description: analysis.description,
            element: analysis.metadata,
            viewport: {
                width: targetWindow.innerWidth,
                height: targetWindow.innerHeight,
                scrollX: targetWindow.scrollX,
                scrollY: targetWindow.scrollY,
                devicePixelRatio: targetWindow.devicePixelRatio,
                zoom: visualViewport?.scale ?? 1,
                visualViewport: {
                    width: visualViewport?.width ?? targetWindow.innerWidth,
                    height: visualViewport?.height ?? targetWindow.innerHeight,
                    offsetLeft: visualViewport?.offsetLeft ?? 0,
                    offsetTop: visualViewport?.offsetTop ?? 0,
                    scale: visualViewport?.scale ?? 1,
                },
            },
            highlight: {
                rect: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                },
                coordinateSpace: "viewport-css-pixels",
                hidden: false,
            },
        },
    };

    const result = RecordingRequestMessageSchema.safeParse(message);
    return result.success ? result.data : null;
}

function getEventElement(event: Event): Element | null {
    return event.composedPath().find(
        (candidate): candidate is Element => candidate instanceof Element,
    ) ?? null;
}

function isVisible(element: Element, targetWindow: Window): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || element.hasAttribute("hidden")) {
        return false;
    }

    const style = targetWindow.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
}

function isCaptureInstallationState(value: unknown): value is CaptureInstallationState {
    return typeof value === "object" && value !== null && "sendMessage" in value;
}