import type {
    CapturedStep,
    ElementRect,
    HighlightMetadata,
    ScreenshotMetadata,
    Viewport,
} from "@capchur/contracts";

const DEFAULT_MINIMUM_CAPTURE_INTERVAL_MS = 600;
const DEFAULT_RENDER_SETTLE_DELAY_MS = 100;

export interface ScreenshotAttachment {
    screenshot: ScreenshotMetadata;
    highlight: HighlightMetadata;
    viewport: Viewport;
}

export interface ScreenshotSource {
    tabId: number;
    windowId: number;
}

interface ScreenshotCaptureDependencies {
    captureVisibleTab(windowId: number): Promise<string>;
    ensureTabActive(tabId: number, windowId: number): Promise<boolean>;
    getZoom(tabId: number): Promise<number>;
    saveImage(storageKey: string, dataUrl: string): Promise<void>;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    minimumIntervalMs?: number;
    renderSettleDelayMs?: number;
}

export type AttachScreenshot = (
    step: CapturedStep,
    source: ScreenshotSource,
) => Promise<ScreenshotAttachment>;

export function createScreenshotCapture(
    dependencies: ScreenshotCaptureDependencies,
): AttachScreenshot {
    const now = dependencies.now ?? Date.now;
    const delay = dependencies.delay ?? ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const minimumInterval = dependencies.minimumIntervalMs
        ?? DEFAULT_MINIMUM_CAPTURE_INTERVAL_MS;
    const renderSettleDelay = dependencies.renderSettleDelayMs
        ?? DEFAULT_RENDER_SETTLE_DELAY_MS;
    let lastCaptureStartedAt = Number.NEGATIVE_INFINITY;

    return async (step, source) => {
        await delay(renderSettleDelay);

        const elapsed = now() - lastCaptureStartedAt;
        if (elapsed < minimumInterval) {
            await delay(minimumInterval - elapsed);
        }

        if (!await dependencies.ensureTabActive(source.tabId, source.windowId)) {
            throw new Error("The source tab is no longer active.");
        }

        lastCaptureStartedAt = now();
        const dataUrl = await dependencies.captureVisibleTab(source.windowId);
        const dimensions = readPngDimensions(dataUrl);
        const storageKey = `screenshots/${step.sessionId}/${step.id}`;
        await dependencies.saveImage(storageKey, dataUrl);

        let zoom = step.viewport.zoom;
        try {
            zoom = await dependencies.getZoom(source.tabId);
        } catch {
            // The content-script value remains a valid fallback where getZoom is unavailable.
        }

        return {
            screenshot: {
                id: step.id,
                mimeType: "image/png",
                width: dimensions.width,
                height: dimensions.height,
                capturedAt: now(),
                storageKey,
            },
            highlight: {
                rect: convertRectToScreenshotPixels(
                    step.highlight.rect,
                    step.viewport,
                    dimensions,
                ),
                coordinateSpace: "screenshot-pixels",
                hidden: step.highlight.hidden,
            },
            viewport: { ...step.viewport, zoom },
        };
    };
}

export function convertRectToScreenshotPixels(
    rect: ElementRect,
    viewport: Viewport,
    screenshot: { width: number; height: number },
): ElementRect {
    const scaleX = screenshot.width / viewport.visualViewport.width;
    const scaleY = screenshot.height / viewport.visualViewport.height;
    const left = clamp(
        (rect.x - viewport.visualViewport.offsetLeft) * scaleX,
        0,
        screenshot.width,
    );
    const top = clamp(
        (rect.y - viewport.visualViewport.offsetTop) * scaleY,
        0,
        screenshot.height,
    );
    const right = clamp(
        (rect.x + rect.width - viewport.visualViewport.offsetLeft) * scaleX,
        0,
        screenshot.width,
    );
    const bottom = clamp(
        (rect.y + rect.height - viewport.visualViewport.offsetTop) * scaleY,
        0,
        screenshot.height,
    );

    return {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
    };
}

export function readPngDimensions(dataUrl: string): { width: number; height: number } {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const encodedImage = match?.[1];
    if (!encodedImage) {
        throw new Error("The screenshot is not a PNG data URL.");
    }

    const bytes = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
        bytes.length < 24
        || signature.some((value, index) => bytes[index] !== value)
    ) {
        throw new Error("The screenshot PNG header is invalid.");
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width === 0 || height === 0) {
        throw new Error("The screenshot dimensions are invalid.");
    }

    return { width, height };
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}