import { describe, expect, it } from "vitest";

import type { RecordingSession } from "./contracts";
import {
    createSyncQueue,
    SyncTransportError,
    type SyncQueueStorageArea,
} from "./sync-queue";

class MemoryStorage implements SyncQueueStorageArea {
    values: Record<string, unknown> = {};

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

function session(id: string, updatedAt = 200): RecordingSession {
    return {
        id,
        status: "stopped",
        startedAt: 100,
        updatedAt,
        steps: [],
    };
}

describe("extension sync queue", () => {
    it("creates an idempotency key with the default browser crypto receiver", async () => {
        const storage = new MemoryStorage();
        const queue = createSyncQueue(storage, {
            authorize: async () => ({ accessToken: "a".repeat(32), expiresAt: 100_000 }),
            upload: async (_token, request) => ({
                guideId: "0198f1d0-c184-7000-8000-000000000402",
                sessionId: request.session.id,
                syncedAt: 1_000,
            }),
        }, async () => undefined, () => 1_000);

        await queue.authorize();
        const synced = await queue.enqueue(session(
            "0198f1d0-c184-7000-8000-000000000400",
        ));

        expect(synced.state).toBe("synced");
    });

    it("retries an offline upload with one idempotency key and one guide mapping", async () => {
        const storage = new MemoryStorage();
        const scheduled: number[] = [];
        const requests: string[] = [];
        const resumedStepIds: string[][] = [];
        const uploadedStepId = "0198f1d0-c184-7000-8000-000000000403";
        let currentTime = 1_000;
        let offline = true;
        const queue = createSyncQueue(storage, {
            authorize: async () => ({ accessToken: "a".repeat(32), expiresAt: 100_000 }),
            upload: async (_token, request, uploadedStepIds, markStepUploaded) => {
                requests.push(request.idempotencyKey);
                resumedStepIds.push([...uploadedStepIds]);
                if (offline) {
                    await markStepUploaded(uploadedStepId);
                    throw new SyncTransportError("offline", "Offline. Retry scheduled.");
                }
                return {
                    guideId: "0198f1d0-c184-7000-8000-000000000402",
                    sessionId: request.session.id,
                    syncedAt: currentTime,
                };
            },
        }, async (when) => { scheduled.push(when); }, () => currentTime,
        () => "0198f1d0-c184-7000-8000-000000000401");

        expect((await queue.enqueue(session(
            "0198f1d0-c184-7000-8000-000000000400",
        ))).state).toBe("disconnected");
        expect((await queue.authorize()).state).toBe("retrying");
        expect(scheduled).toEqual([2_000]);

        offline = false;
        currentTime = 2_000;
        const synced = await queue.flush();
        expect(synced).toMatchObject({
            state: "synced",
            guideId: "0198f1d0-c184-7000-8000-000000000402",
        });
        expect(new Set(requests).size).toBe(1);
        expect(resumedStepIds).toEqual([[], [uploadedStepId]]);
    });

    it("preserves completed jobs while exposing conflicts and expired sessions", async () => {
        const storage = new MemoryStorage();
        let currentTime = 1_000;
        let uploadCount = 0;
        const queue = createSyncQueue(storage, {
            authorize: async () => ({ accessToken: "b".repeat(32), expiresAt: 2_000 }),
            upload: async (_token, request) => {
                uploadCount += 1;
                if (uploadCount === 2) {
                    throw new SyncTransportError("conflict", "A newer cloud revision exists.");
                }
                return {
                    guideId: "0198f1d0-c184-7000-8000-000000000412",
                    sessionId: request.session.id,
                    syncedAt: currentTime,
                };
            },
        }, async () => undefined, () => currentTime,
        () => uploadCount === 0
            ? "0198f1d0-c184-7000-8000-000000000410"
            : "0198f1d0-c184-7000-8000-000000000411");

        await queue.authorize();
        expect((await queue.enqueue(session(
            "0198f1d0-c184-7000-8000-000000000413",
        ))).state).toBe("synced");
        expect((await queue.enqueue(session(
            "0198f1d0-c184-7000-8000-000000000414",
        ))).state).toBe("conflict");

        currentTime = 2_001;
        const expired = await queue.enqueue(session(
            "0198f1d0-c184-7000-8000-000000000415",
        ));
        expect(expired).toMatchObject({
            state: "disconnected",
            message: "Sign in to continue syncing.",
        });
        expect(uploadCount).toBe(2);
    });
});