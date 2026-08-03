import { describe, expect, it } from "vitest";

import { CONTRACT_VERSION } from "./contracts";
import { createRecordingMessageHandler } from "./recording-messages";
import { createRecordingStorage, type ExtensionStorageArea } from "./recording-storage";

const requestId = "0198f1d0-c184-7000-8000-000000000001";
const sessionId = "0198f1d0-c184-7000-8000-000000000002";

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
});