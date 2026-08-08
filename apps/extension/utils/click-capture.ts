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
const DROPDOWN_OPTION_SELECTOR = [
    '[role="option"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="treeitem"]',
].join(",");
const DROPDOWN_DWELL_MS = 200;

interface CaptureInstallationState {
    sendMessage: SendMessage;
    dropdownPreviewTarget?: Element | null;
    dropdownPreviewTimer?: number;
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
    const capture = (
        event: Event,
        action: SupportedCaptureAction,
        onSettled?: () => void,
    ): void => {
        if (recentEvents.has(event)) {
            onSettled?.();
            return;
        }
        recentEvents.add(event);

        const message = createActionCaptureMessage(event, targetWindow, action);
        if (message) {
            void state.sendMessage(message).catch(() => undefined).finally(onSettled);
        } else {
            onSettled?.();
        }
    };

    targetWindow.addEventListener("click", (event) => {
        clearDropdownPreviewTimer(targetWindow, state);
        state.dropdownPreviewTarget = null;
        const option = getEventElement(event)?.closest(DROPDOWN_OPTION_SELECTOR);
        const releaseDropdown = option
            ? retainDropdownVisual(option, targetWindow)
            : undefined;
        capture(event, "click", releaseDropdown);
    }, { capture: true });
    targetWindow.addEventListener("pointerdown", (event) => {
        const target = getEventElement(event);
        if (!target?.closest("select")) {
            return;
        }

        const message = createSelectPreviewMessage(event, targetWindow);
        if (message) {
            void state.sendMessage(message).catch(() => undefined);
        }
    }, { capture: true });
    const scheduleDropdownPreview = (event: Event): void => {
        const option = getEventElement(event)?.closest(DROPDOWN_OPTION_SELECTOR) ?? null;
        if (option === state.dropdownPreviewTarget) {
            return;
        }

        clearDropdownPreviewTimer(targetWindow, state);
        state.dropdownPreviewTarget = option;
        if (!option) {
            return;
        }

        state.dropdownPreviewTimer = targetWindow.setTimeout(() => {
            state.dropdownPreviewTimer = undefined;
            if (!option.isConnected || state.dropdownPreviewTarget !== option) {
                return;
            }

            const message = createDropdownClickPreviewMessage(option, targetWindow);
            if (message) {
                void state.sendMessage(message).catch(() => undefined);
            }
        }, DROPDOWN_DWELL_MS);
    };
    targetWindow.addEventListener("pointerover", scheduleDropdownPreview, { capture: true });
    targetWindow.addEventListener("pointermove", scheduleDropdownPreview, { capture: true });
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
    return element ? createActionCaptureMessageForElement(element, targetWindow, action) : null;
}

function createActionCaptureMessageForElement(
    element: Element,
    targetWindow: Window,
    action: SupportedCaptureAction,
): RecordingRequestMessage | null {
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

export function createSelectPreviewMessage(
    event: Event,
    targetWindow: Window,
): RecordingRequestMessage | null {
    if (!getEventElement(event)?.closest("select")) {
        return null;
    }

    const message = createActionCaptureMessage(event, targetWindow, "select");
    if (!message || message.type !== "capture.select") {
        return null;
    }

    return { ...message, type: "capture.select.preview" };
}

export function createDropdownClickPreviewMessage(
    element: Element,
    targetWindow: Window,
): RecordingRequestMessage | null {
    if (!element.matches(DROPDOWN_OPTION_SELECTOR)) {
        return null;
    }

    const message = createActionCaptureMessageForElement(element, targetWindow, "click");
    if (!message || message.type !== "capture.click") {
        return null;
    }

    return { ...message, type: "capture.click.preview" };
}

function clearDropdownPreviewTimer(
    targetWindow: Window,
    state: CaptureInstallationState,
): void {
    if (state.dropdownPreviewTimer !== undefined) {
        targetWindow.clearTimeout(state.dropdownPreviewTimer);
        state.dropdownPreviewTimer = undefined;
    }
}

function retainDropdownVisual(option: Element, targetWindow: Window): () => void {
    const dropdown = option.closest('[role="listbox"], [role="menu"], [role="tree"]')
        ?? option.parentElement;
    if (!dropdown || dropdown.closest("[data-capchur-ui]")) {
        return () => undefined;
    }

    const rect = dropdown.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return () => undefined;
    }

    const clone = dropdown.cloneNode(true) as HTMLElement;
    copyComputedStyles(dropdown, clone, targetWindow);
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    clone.removeAttribute("id");
    clone.dataset.capchurUi = "retained-dropdown";
    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, {
        display: "block",
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: "0",
        pointerEvents: "none",
        transform: "none",
        visibility: "visible",
        zIndex: "2147483647",
    });
    targetWindow.document.documentElement.append(clone);
    return () => clone.remove();
}

function copyComputedStyles(
    source: Element,
    clone: HTMLElement,
    targetWindow: Window,
): void {
    const sourceElements = [source, ...Array.from(source.querySelectorAll("*"))];
    const cloneElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
    sourceElements.forEach((sourceElement, index) => {
        const cloneElement = cloneElements[index];
        if (!cloneElement) {
            return;
        }

        const computedStyle = targetWindow.getComputedStyle(sourceElement);
        for (const property of Array.from(computedStyle)) {
            cloneElement.style.setProperty(
                property,
                computedStyle.getPropertyValue(property),
                computedStyle.getPropertyPriority(property),
            );
        }
    });
}