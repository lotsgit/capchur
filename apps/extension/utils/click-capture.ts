import { analyzeElement } from "@capchur/capture-core";
import {
    CONTRACT_VERSION,
    RecordingRequestMessageSchema,
    type RecordingRequestMessage,
} from "@capchur/contracts";

type SendMessage = (message: RecordingRequestMessage) => Promise<unknown>;

const recentEvents = new WeakSet<Event>();
const installationKey = "__capchurClickCaptureInstalledV1";

export function installClickCapture(targetWindow: Window, sendMessage: SendMessage): void {
    const installationState = targetWindow as Window & Record<string, unknown>;
    if (installationState[installationKey] === true) {
        return;
    }

    installationState[installationKey] = true;
    targetWindow.addEventListener("click", (event) => {
        if (recentEvents.has(event)) {
            return;
        }
        recentEvents.add(event);

        const message = createClickCaptureMessage(event, targetWindow);
        if (message) {
            void sendMessage(message).catch(() => undefined);
        }
    }, { capture: true });
}

export function createClickCaptureMessage(
    event: Event,
    targetWindow: Window,
): RecordingRequestMessage | null {
    const element = event.composedPath().find(
        (candidate): candidate is Element => candidate instanceof Element,
    );
    if (!element || element.closest("[data-capchur-ui]") || !isVisible(element, targetWindow)) {
        return null;
    }

    const analysis = analyzeElement(element);
    if (!analysis.supported) {
        return null;
    }

    const rect = element.getBoundingClientRect();
    const visualViewport = targetWindow.visualViewport;
    const message = {
        version: CONTRACT_VERSION,
        type: "capture.click",
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

function isVisible(element: Element, targetWindow: Window): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || element.hasAttribute("hidden")) {
        return false;
    }

    const style = targetWindow.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
}