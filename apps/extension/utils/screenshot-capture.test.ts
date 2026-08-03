import { describe, expect, it, vi } from "vitest";

import type { CapturedStep } from "./contracts";
import {
    convertRectToScreenshotPixels,
    createScreenshotCapture,
    readPngDimensions,
} from "./screenshot-capture";

const step: CapturedStep = {
    id: "0198f1d0-c184-7000-8000-000000000003",
    sessionId: "0198f1d0-c184-7000-8000-000000000002",
    sequence: 0,
    action: "click",
    timestamp: 200,
    url: "https://example.com/settings",
    pageTitle: "Settings",
    description: "Click the Save button",
    element: { tagName: "button", selectors: ["#save"] },
    viewport: {
        width: 1024,
        height: 576,
        scrollX: 300,
        scrollY: 600,
        devicePixelRatio: 1.25,
        zoom: 1,
        visualViewport: {
            width: 1024,
            height: 576,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
        },
    },
    screenshot: null,
    highlight: {
        rect: { x: 100, y: 80, width: 120, height: 36 },
        coordinateSpace: "viewport-css-pixels",
        hidden: false,
    },
};

function pngDataUrl(width: number, height: number): string {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe("screenshot capture", () => {
    it.each([
        [1, 1280, { x: 100, y: 100, width: 120, height: 45 }],
        [1.25, 1024, { x: 125, y: 100, width: 150, height: 45 }],
        [1.5, 1280 / 1.5, { x: 150, y: 100, width: 180, height: 45 }],
    ])("aligns highlights at %sx browser zoom", (zoom, viewportWidth, expected) => {
        const viewport = {
            ...step.viewport,
            zoom,
            visualViewport: {
                ...step.viewport.visualViewport,
                width: viewportWidth,
                height: 576,
            },
        };

        expect(convertRectToScreenshotPixels(step.highlight.rect, viewport, {
            width: 1280,
            height: 720,
        })).toEqual(expected);
    });

    it("accounts for visual viewport offsets and clips to screenshot bounds", () => {
        const viewport = {
            ...step.viewport,
            visualViewport: {
                ...step.viewport.visualViewport,
                width: 500,
                height: 300,
                offsetLeft: 50,
                offsetTop: 25,
            },
        };

        expect(convertRectToScreenshotPixels(
            { x: 25, y: 10, width: 100, height: 50 },
            viewport,
            { width: 1000, height: 600 },
        )).toEqual({ x: 0, y: 0, width: 150, height: 70 });
    });

    it("reads captured PNG dimensions", () => {
        expect(readPngDimensions(pngDataUrl(1280, 720))).toEqual({
            width: 1280,
            height: 720,
        });
    });

    it("rate limits captures and stores pixels separately from metadata", async () => {
        let currentTime = 1_000;
        const delay = vi.fn(async (milliseconds: number) => {
            currentTime += milliseconds;
        });
        const saveImage = vi.fn().mockResolvedValue(undefined);
        const attach = createScreenshotCapture({
            captureVisibleTab: vi.fn().mockResolvedValue(pngDataUrl(1280, 720)),
            ensureTabActive: vi.fn().mockResolvedValue(true),
            getZoom: vi.fn().mockResolvedValue(1.25),
            saveImage,
            now: () => currentTime,
            delay,
        });

        const first = await attach(step, { tabId: 4, windowId: 2 });
        const second = await attach({ ...step, id: "0198f1d0-c184-7000-8000-000000000004" }, {
            tabId: 4,
            windowId: 2,
        });

        expect(delay).toHaveBeenCalledWith(500);
        expect(saveImage).toHaveBeenCalledTimes(2);
        expect(first).toMatchObject({
            screenshot: { width: 1280, height: 720 },
            highlight: {
                rect: { x: 125, y: 100, width: 150, height: 45 },
                coordinateSpace: "screenshot-pixels",
            },
            viewport: { scrollX: 300, scrollY: 600, zoom: 1.25 },
        });
        expect(second.screenshot.storageKey).not.toBe(first.screenshot.storageKey);
    });
});