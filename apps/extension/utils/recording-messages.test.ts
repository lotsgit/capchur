import { describe, expect, it, vi } from "vitest";

import { CONTRACT_VERSION } from "./contracts";
import { createRecordingMessageHandler } from "./recording-messages";
import { createRecordingStorage, type ExtensionStorageArea } from "./recording-storage";

const requestId = "0198f1d0-c184-7000-8000-000000000001";
const sessionId = "0198f1d0-c184-7000-8000-000000000002";
const stepIds = Array.from(
    { length: 6 },
    (_, index) => `0198f1d0-c184-7000-8000-00000000001${index}`,
);

const clickCapture = {
    timestamp: 200,
    url: "https://example.com/settings",
    pageTitle: "Settings",
    description: "Click the Save button",
    element: {
        tagName: "button",
        accessibleName: "Save",
        role: "button",
        selectors: ["#save"],
    },
    viewport: {
        width: 1280,
        height: 720,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
        zoom: 1,
        visualViewport: {
            width: 1280,
            height: 720,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
        },
    },
    highlight: {
        rect: { x: 100, y: 80, width: 120, height: 36 },
        coordinateSpace: "viewport-css-pixels" as const,
        hidden: false,
    },
};

class FakeStorageArea implements ExtensionStorageArea {
    readonly values: Record<string, unknown> = {};

    async get(key: string) {
        return key in this.values ? { [key]: this.values[key] } : {};
    }

    async set(items: Record<string, unknown>) {
        Object.assign(this.values, items);
    }

    async remove(key: string) {
        delete this.values[key];
    }
}

describe("recording service-worker messages", () => {
    it("persists start, stop, resume, and clear transitions before replying", async () => {
        const storageArea = new FakeStorageArea();
        const handler = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
            { now: () => 100, createId: () => sessionId },
        );

        const started = await handler({
            version: CONTRACT_VERSION,
            type: "recording.start",
            requestId,
        });
        expect(started).toMatchObject({ ok: true, session: { id: sessionId, status: "recording" } });
        expect(storageArea.values.recordingSession).toEqual(
            started.ok ? started.session : null,
        );

        const stopped = await handler({
            version: CONTRACT_VERSION,
            type: "recording.stop",
            requestId,
            sessionId,
        });
        expect(stopped).toMatchObject({ ok: true, session: { status: "stopped" } });

        const resumed = await handler({
            version: CONTRACT_VERSION,
            type: "recording.resume",
            requestId,
            sessionId,
        });
        expect(resumed).toMatchObject({ ok: true, session: { status: "recording" } });

        const cleared = await handler({
            version: CONTRACT_VERSION,
            type: "recording.clear",
            requestId,
            sessionId,
        });
        expect(cleared).toMatchObject({ ok: true, session: null });
        expect(storageArea.values).toEqual({});
    });

    it("loads the same state after a service-worker restart", async () => {
        const storageArea = new FakeStorageArea();
        const firstWorker = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
            { now: () => 100, createId: () => sessionId },
        );
        await firstWorker({
            version: CONTRACT_VERSION,
            type: "recording.start",
            requestId,
        });

        const restartedWorker = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
        );
        const status = await restartedWorker({
            version: CONTRACT_VERSION,
            type: "recording.status",
            requestId,
        });

        expect(status).toMatchObject({
            ok: true,
            session: { id: sessionId, status: "recording", startedAt: 100 },
        });
    });

    it("removes corrupted persisted state and reports no active session", async () => {
        const storageArea = new FakeStorageArea();
        storageArea.values.recordingSession = { id: "invalid", status: "recording" };
        const handler = createRecordingMessageHandler(createRecordingStorage(storageArea));

        const status = await handler({
            version: CONTRACT_VERSION,
            type: "recording.status",
            requestId,
        });

        expect(status).toMatchObject({ ok: true, session: null });
        expect(storageArea.values).toEqual({});
    });

    it("does not clear a different session", async () => {
        const storageArea = new FakeStorageArea();
        const handler = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
            { now: () => 100, createId: () => sessionId },
        );
        await handler({ version: CONTRACT_VERSION, type: "recording.start", requestId });

        const response = await handler({
            version: CONTRACT_VERSION,
            type: "recording.clear",
            requestId,
            sessionId: "0198f1d0-c184-7000-8000-000000000003",
        });

        expect(response).toMatchObject({ ok: false, error: { code: "SESSION_NOT_FOUND" } });
        expect(storageArea.values.recordingSession).toBeDefined();
    });

    it("persists five ordered clicks and ignores captures after stopping", async () => {
        const storageArea = new FakeStorageArea();
        const ids = [sessionId, ...stepIds];
        const handler = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
            {
                now: () => 300,
                createId: () => {
                    const id = ids.shift();
                    if (!id) {
                        throw new Error("The deterministic ID fixture was exhausted.");
                    }
                    return id;
                },
            },
        );
        await handler({ version: CONTRACT_VERSION, type: "recording.start", requestId });

        for (let index = 0; index < 5; index += 1) {
            await handler({
                version: CONTRACT_VERSION,
                type: "capture.click",
                requestId: stepIds[index],
                capture: { ...clickCapture, timestamp: clickCapture.timestamp + index },
            }, clickCapture.url);
        }

        await handler({
            version: CONTRACT_VERSION,
            type: "recording.stop",
            requestId,
            sessionId,
        });
        const ignored = await handler({
            version: CONTRACT_VERSION,
            type: "capture.click",
            requestId: stepIds[5],
            capture: clickCapture,
        }, clickCapture.url);

        expect(ignored).toMatchObject({
            ok: true,
            session: {
                status: "stopped",
                steps: stepIds.slice(0, 5).map((id, sequence) => ({ id, sequence })),
            },
        });
        expect(storageArea.values.recordingSession).toEqual(
            ignored.ok ? ignored.session : null,
        );
    });

    it("persists input, select, and submit actions in order", async () => {
        const storageArea = new FakeStorageArea();
        const ids = [sessionId, ...stepIds.slice(0, 3)];
        const handler = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
            { now: () => 300, createId: () => ids.shift()! },
        );
        await handler({ version: CONTRACT_VERSION, type: "recording.start", requestId });

        for (const [index, action] of ["input", "select", "submit"].entries()) {
            await handler({
                version: CONTRACT_VERSION,
                type: `capture.${action}` as "capture.input" | "capture.select" | "capture.submit",
                requestId: stepIds[index],
                capture: clickCapture,
            }, clickCapture.url);
        }

        expect(storageArea.values.recordingSession).toMatchObject({
            steps: [
                { action: "input", sequence: 0 },
                { action: "select", sequence: 1 },
                { action: "submit", sequence: 2 },
            ],
        });
    });

    it("rejects captures whose runtime sender does not match the page URL", async () => {
        const storageArea = new FakeStorageArea();
        const handler = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
            { now: () => 300, createId: () => sessionId },
        );
        await handler({ version: CONTRACT_VERSION, type: "recording.start", requestId });

        const response = await handler({
            version: CONTRACT_VERSION,
            type: "capture.click",
            requestId,
            capture: clickCapture,
        }, "chrome-extension://capchur/popup.html");

        expect(response).toMatchObject({
            ok: false,
            error: { code: "INVALID_MESSAGE" },
        });
        expect(storageArea.values.recordingSession).toMatchObject({ steps: [] });
    });

    it("attaches screenshot metadata after the underlying step is persisted", async () => {
        const storageArea = new FakeStorageArea();
        const screenshotStepId = "0198f1d0-c184-7000-8000-000000000010";
        const attachScreenshot = async () => ({
            screenshot: {
                id: screenshotStepId,
                mimeType: "image/png" as const,
                width: 1600,
                height: 900,
                capturedAt: 301,
                storageKey: `screenshots/${sessionId}/${screenshotStepId}`,
            },
            highlight: {
                rect: { x: 125, y: 100, width: 150, height: 45 },
                coordinateSpace: "screenshot-pixels" as const,
                hidden: false,
            },
            viewport: { ...clickCapture.viewport, zoom: 1.25 },
        });
        const ids = [sessionId, screenshotStepId];
        const handler = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
            {
                now: () => 300,
                createId: () => ids.shift() ?? screenshotStepId,
                attachScreenshot,
            },
        );
        await handler({ version: CONTRACT_VERSION, type: "recording.start", requestId });

        const response = await handler({
            version: CONTRACT_VERSION,
            type: "capture.click",
            requestId,
            capture: clickCapture,
        }, { url: clickCapture.url, tabId: 4, windowId: 2 });

        expect(response).toMatchObject({
            ok: true,
            session: {
                steps: [{
                    screenshot: { width: 1600, height: 900 },
                    highlight: { coordinateSpace: "screenshot-pixels" },
                    viewport: { zoom: 1.25 },
                }],
            },
        });
        expect(storageArea.values.recordingSession).toEqual(
            response.ok ? response.session : null,
        );
    });

    it("uses a prepared native-select screenshot once the selection is committed", async () => {
        const storageArea = new FakeStorageArea();
        const screenshotStepId = "0198f1d0-c184-7000-8000-000000000010";
        const candidate = {
            dataUrl: "data:image/png;base64,preview",
            dimensions: { width: 1600, height: 900 },
            capturedAt: 250,
            zoom: 1,
        };
        const prepareScreenshot = vi.fn().mockResolvedValue(candidate);
        const attachScreenshot = vi.fn().mockResolvedValue({
            screenshot: {
                id: screenshotStepId,
                mimeType: "image/png" as const,
                width: 1600,
                height: 900,
                capturedAt: 250,
                storageKey: `screenshots/${sessionId}/${screenshotStepId}`,
            },
            highlight: clickCapture.highlight,
            viewport: clickCapture.viewport,
        });
        const ids = [sessionId, screenshotStepId];
        const handler = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
            {
                now: () => 300,
                createId: () => ids.shift() ?? screenshotStepId,
                prepareScreenshot,
                attachScreenshot,
            },
        );
        await handler({ version: CONTRACT_VERSION, type: "recording.start", requestId });
        const source = { url: clickCapture.url, tabId: 4, windowId: 2 };

        const preview = await handler({
            version: CONTRACT_VERSION,
            type: "capture.select.preview",
            requestId,
            capture: clickCapture,
        }, source);
        const selected = await handler({
            version: CONTRACT_VERSION,
            type: "capture.select",
            requestId,
            capture: clickCapture,
        }, source);

        expect(preview).toMatchObject({ ok: true, session: { steps: [] } });
        expect(prepareScreenshot).toHaveBeenCalledWith(
            { tabId: 4, windowId: 2 },
            undefined,
        );
        expect(attachScreenshot).toHaveBeenCalledWith(
            expect.objectContaining({ action: "select" }),
            { tabId: 4, windowId: 2 },
            candidate,
        );
        expect(selected).toMatchObject({
            ok: true,
            session: { steps: [{ screenshot: { capturedAt: 250 } }] },
        });
    });

    it("uses a matching ARIA-option dwell screenshot for the committed click", async () => {
        const storageArea = new FakeStorageArea();
        const screenshotStepId = "0198f1d0-c184-7000-8000-000000000010";
        const optionCapture = {
            ...clickCapture,
            description: "Click the Northwind Traders option",
            element: {
                tagName: "div",
                accessibleName: "Northwind Traders",
                role: "option",
                selectors: ["#account-option"],
            },
        };
        const candidate = {
            dataUrl: "data:image/png;base64,preview",
            dimensions: { width: 1600, height: 900 },
            capturedAt: 250,
            zoom: 1,
        };
        const prepareScreenshot = vi.fn().mockResolvedValue(candidate);
        const attachScreenshot = vi.fn().mockResolvedValue({
            screenshot: {
                id: screenshotStepId,
                mimeType: "image/png" as const,
                width: 1600,
                height: 900,
                capturedAt: 250,
                storageKey: `screenshots/${sessionId}/${screenshotStepId}`,
            },
            highlight: optionCapture.highlight,
            viewport: optionCapture.viewport,
        });
        const ids = [sessionId, screenshotStepId];
        const handler = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
            {
                now: () => 300,
                createId: () => ids.shift() ?? screenshotStepId,
                prepareScreenshot,
                attachScreenshot,
            },
        );
        await handler({ version: CONTRACT_VERSION, type: "recording.start", requestId });
        const source = { url: clickCapture.url, tabId: 4, windowId: 2 };

        await handler({
            version: CONTRACT_VERSION,
            type: "capture.click.preview",
            requestId,
            capture: optionCapture,
        }, source);
        const clicked = await handler({
            version: CONTRACT_VERSION,
            type: "capture.click",
            requestId,
            capture: optionCapture,
        }, source);

        expect(prepareScreenshot).toHaveBeenCalledWith({ tabId: 4, windowId: 2 }, 0);
        expect(attachScreenshot).toHaveBeenCalledWith(
            expect.objectContaining({ action: "click" }),
            { tabId: 4, windowId: 2 },
            candidate,
        );
        expect(clicked).toMatchObject({
            ok: true,
            session: { steps: [{ screenshot: { capturedAt: 250 } }] },
        });
    });

    it("keeps the persisted step when screenshot capture fails", async () => {
        const storageArea = new FakeStorageArea();
        const reportScreenshotError = vi.fn();
        const screenshotStepId = "0198f1d0-c184-7000-8000-000000000010";
        const ids = [sessionId, screenshotStepId];
        const handler = createRecordingMessageHandler(
            createRecordingStorage(storageArea),
            {
                now: () => 300,
                createId: () => ids.shift() ?? screenshotStepId,
                attachScreenshot: async () => {
                    throw new Error("Visible-tab capture was denied.");
                },
                reportScreenshotError,
            },
        );
        await handler({ version: CONTRACT_VERSION, type: "recording.start", requestId });

        const response = await handler({
            version: CONTRACT_VERSION,
            type: "capture.click",
            requestId,
            capture: clickCapture,
        }, { url: clickCapture.url, tabId: 4, windowId: 2 });

        expect(response).toMatchObject({
            ok: true,
            session: { steps: [{ id: screenshotStepId, screenshot: null }] },
        });
        expect(storageArea.values.recordingSession).toEqual(
            response.ok ? response.session : null,
        );
        expect(reportScreenshotError).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Visible-tab capture was denied." }),
        );
    });

    it("renames, reorders, and deletes persisted steps", async () => {
        const storageArea = new FakeStorageArea();
        const ids = [sessionId, stepIds[0], stepIds[1]];
        const deletedStorageKeys: string[] = [];
        const handler = createRecordingMessageHandler(createRecordingStorage(storageArea), {
            now: () => 400,
            createId: () => ids.shift() ?? sessionId,
            attachScreenshot: async (step) => ({
                screenshot: {
                    id: step.id,
                    mimeType: "image/png",
                    width: 1280,
                    height: 720,
                    capturedAt: 300,
                    storageKey: `screenshots/${sessionId}/${step.id}`,
                },
                highlight: step.highlight,
                viewport: step.viewport,
            }),
            deleteScreenshot: async (storageKey) => {
                deletedStorageKeys.push(storageKey);
            },
        });
        await handler({ version: CONTRACT_VERSION, type: "recording.start", requestId });
        for (const stepId of stepIds.slice(0, 2)) {
            await handler({
                version: CONTRACT_VERSION,
                type: "capture.click",
                requestId: stepId,
                capture: clickCapture,
            }, { url: clickCapture.url, tabId: 4, windowId: 2 });
        }

        const renamed = await handler({
            version: CONTRACT_VERSION,
            type: "recording.step.update",
            requestId,
            sessionId,
            stepId: stepIds[0],
            description: "Click Save changes",
        });
        expect(renamed.ok && renamed.session?.steps[0]?.description)
            .toBe("Click Save changes");

        const reordered = await handler({
            version: CONTRACT_VERSION,
            type: "recording.steps.reorder",
            requestId,
            sessionId,
            stepIds: [stepIds[1], stepIds[0]],
        });
        expect(reordered).toMatchObject({
            ok: true,
            session: { steps: [{ id: stepIds[1], sequence: 0 }, { id: stepIds[0], sequence: 1 }] },
        });

        const deleted = await handler({
            version: CONTRACT_VERSION,
            type: "recording.step.delete",
            requestId,
            sessionId,
            stepId: stepIds[1],
        });
        expect(deleted).toMatchObject({
            ok: true,
            session: { steps: [{ id: stepIds[0], sequence: 0 }] },
        });
        expect(deletedStorageKeys).toEqual([`screenshots/${sessionId}/${stepIds[1]}`]);
    });

    it("imports a validated session and reports retry screenshot failures", async () => {
        const storageArea = new FakeStorageArea();
        const importedSession = {
            id: sessionId,
            status: "stopped" as const,
            startedAt: 100,
            updatedAt: 200,
            steps: [{
                id: stepIds[0],
                sessionId,
                sequence: 0,
                action: "click" as const,
                ...clickCapture,
                screenshot: null,
            }],
        };
        const handler = createRecordingMessageHandler(createRecordingStorage(storageArea), {
            retryScreenshot: async () => {
                throw new Error("Open the source page in a browser tab before retrying.");
            },
        });

        const imported = await handler({
            version: CONTRACT_VERSION,
            type: "recording.import",
            requestId,
            session: importedSession,
        });
        expect(imported).toMatchObject({ ok: true, session: importedSession });

        const retried = await handler({
            version: CONTRACT_VERSION,
            type: "recording.screenshot.retry",
            requestId,
            sessionId,
            stepId: stepIds[0],
        });
        expect(retried).toMatchObject({
            ok: false,
            error: {
                code: "SCREENSHOT_UNAVAILABLE",
                message: "Open the source page in a browser tab before retrying.",
            },
        });
    });
});