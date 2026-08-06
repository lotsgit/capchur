import {
    ExtensionAuthorizationSchema,
    SessionSyncRequestSchema,
    SessionSyncResponseSchema,
    type ExtensionAuthorization,
    type ExtensionSyncStatus,
    type RecordingSession,
    type SessionSyncRequest,
    type SessionSyncResponse,
} from "@capchur/contracts";

const SYNC_QUEUE_KEY = "extensionSyncQueue";
const MAX_RETRY_DELAY_MS = 5 * 60 * 1_000;

type JobState = "pending" | "syncing" | "retrying" | "conflict" | "synced";

interface SyncJob {
    request: SessionSyncRequest;
    state: JobState;
    attempts: number;
    nextAttemptAt: number | null;
    guideId: string | null;
    message: string | null;
    uploadedStepIds: string[];
}

interface SyncQueueData {
    credential: ExtensionAuthorization | null;
    jobs: SyncJob[];
}

export interface SyncQueueStorageArea {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(key: string): Promise<void>;
}

export interface SyncTransport {
    authorize(): Promise<ExtensionAuthorization>;
    upload(
        accessToken: string,
        request: SessionSyncRequest,
        uploadedStepIds: readonly string[],
        markStepUploaded: (stepId: string) => Promise<void>,
    ): Promise<SessionSyncResponse>;
}

export class SyncTransportError extends Error {
    constructor(
        readonly kind: "offline" | "unauthorized" | "conflict" | "server",
        message: string,
    ) {
        super(message);
    }
}

function parseJob(value: unknown): SyncJob | null {
    if (!value || typeof value !== "object") return null;
    const job = value as Partial<SyncJob>;
    const request = SessionSyncRequestSchema.safeParse(job.request);
    if (
        !request.success ||
        !["pending", "syncing", "retrying", "conflict", "synced"].includes(String(job.state)) ||
        !Number.isInteger(job.attempts) || Number(job.attempts) < 0 ||
        !(job.nextAttemptAt === null || Number.isInteger(job.nextAttemptAt)) ||
        !(job.guideId === null || typeof job.guideId === "string") ||
        !(job.message === null || typeof job.message === "string") ||
        !(job.uploadedStepIds === undefined || (
            Array.isArray(job.uploadedStepIds) &&
            job.uploadedStepIds.every((stepId) => typeof stepId === "string")
        ))
    ) return null;
    return {
        request: request.data,
        state: job.state as JobState,
        attempts: Number(job.attempts),
        nextAttemptAt: job.nextAttemptAt as number | null,
        guideId: job.guideId as string | null,
        message: job.message as string | null,
        uploadedStepIds: job.uploadedStepIds ?? [],
    };
}

function createStorage(storage: SyncQueueStorageArea) {
    return {
        async load(): Promise<SyncQueueData> {
            const value = (await storage.get(SYNC_QUEUE_KEY))[SYNC_QUEUE_KEY];
            if (!value || typeof value !== "object") return { credential: null, jobs: [] };
            const candidate = value as { credential?: unknown; jobs?: unknown };
            const credential = candidate.credential === null
                ? null
                : ExtensionAuthorizationSchema.safeParse(candidate.credential);
            const jobs = Array.isArray(candidate.jobs) ? candidate.jobs.map(parseJob) : [];
            if (
                credential !== null && !credential.success ||
                jobs.some((job) => job === null)
            ) {
                await storage.remove(SYNC_QUEUE_KEY);
                return { credential: null, jobs: [] };
            }
            return {
                credential: credential === null ? null : credential.data,
                jobs: jobs as SyncJob[],
            };
        },
        save(data: SyncQueueData) {
            return storage.set({ [SYNC_QUEUE_KEY]: data });
        },
    };
}

function visibleStatus(data: SyncQueueData, now: number): ExtensionSyncStatus {
    const job = data.jobs.at(-1);
    if (!job) {
        return {
            state: "disconnected",
            sessionId: null,
            guideId: null,
            attempts: 0,
            nextAttemptAt: null,
            message: data.credential && data.credential.expiresAt > now ? "Connected." : null,
        };
    }
    const disconnected = !data.credential || data.credential.expiresAt <= now;
    return {
        state: disconnected && job.state !== "synced" && job.state !== "conflict"
            ? "disconnected"
            : job.state,
        sessionId: job.request.session.id,
        guideId: job.guideId,
        attempts: job.attempts,
        nextAttemptAt: job.nextAttemptAt,
        message: disconnected && job.state !== "synced" && job.state !== "conflict"
            ? "Sign in to continue syncing."
            : job.message,
    };
}

export function createSyncQueue(
    storageArea: SyncQueueStorageArea,
    transport: SyncTransport,
    scheduleRetry: (when: number) => Promise<void>,
    now: () => number = Date.now,
    createId: () => string = () => crypto.randomUUID(),
) {
    const storage = createStorage(storageArea);
    let running: Promise<ExtensionSyncStatus> | null = null;

    async function flush(): Promise<ExtensionSyncStatus> {
        if (running) return running;
        running = (async () => {
            const data = await storage.load();
            if (!data.credential || data.credential.expiresAt <= now()) {
                data.credential = null;
                await storage.save(data);
                return visibleStatus(data, now());
            }

            for (const job of data.jobs) {
                if (job.state === "synced" || job.state === "conflict") continue;
                if (job.nextAttemptAt !== null && job.nextAttemptAt > now()) {
                    await scheduleRetry(job.nextAttemptAt);
                    continue;
                }
                job.state = "syncing";
                job.message = "Uploading session...";
                await storage.save(data);
                try {
                    const response = SessionSyncResponseSchema.parse(
                        await transport.upload(
                            data.credential.accessToken,
                            job.request,
                            job.uploadedStepIds,
                            async (stepId) => {
                                if (!job.uploadedStepIds.includes(stepId)) {
                                    job.uploadedStepIds.push(stepId);
                                    await storage.save(data);
                                }
                            },
                        ),
                    );
                    job.state = "synced";
                    job.guideId = response.guideId;
                    job.nextAttemptAt = null;
                    job.message = "Session synced.";
                } catch (error) {
                    const failure = error instanceof SyncTransportError
                        ? error
                        : new SyncTransportError("server", "Sync failed. Retry scheduled.");
                    if (failure.kind === "unauthorized") {
                        data.credential = null;
                        job.state = "pending";
                        job.message = "Session expired. Sign in again to continue.";
                        await storage.save(data);
                        return visibleStatus(data, now());
                    }
                    if (failure.kind === "conflict") {
                        job.state = "conflict";
                        job.message = failure.message;
                    } else {
                        job.state = "retrying";
                        job.attempts += 1;
                        job.nextAttemptAt = now() + Math.min(
                            2 ** (job.attempts - 1) * 1_000,
                            MAX_RETRY_DELAY_MS,
                        );
                        job.message = failure.message;
                        await scheduleRetry(job.nextAttemptAt);
                    }
                }
                await storage.save(data);
            }
            return visibleStatus(data, now());
        })().finally(() => {
            running = null;
        });
        return running;
    }

    return {
        async authorize(): Promise<ExtensionSyncStatus> {
            const data = await storage.load();
            data.credential = ExtensionAuthorizationSchema.parse(await transport.authorize());
            await storage.save(data);
            return flush();
        },
        async enqueue(session: RecordingSession): Promise<ExtensionSyncStatus> {
            const data = await storage.load();
            const existing = data.jobs.find((job) => job.request.session.id === session.id);
            if (!existing || existing.request.session.updatedAt !== session.updatedAt) {
                const request = SessionSyncRequestSchema.parse({
                    idempotencyKey: createId(),
                    session,
                });
                if (existing) data.jobs.splice(data.jobs.indexOf(existing), 1);
                data.jobs.push({
                    request,
                    state: "pending",
                    attempts: 0,
                    nextAttemptAt: null,
                    guideId: existing?.guideId ?? null,
                    message: "Waiting to sync.",
                    uploadedStepIds: [],
                });
                await storage.save(data);
            }
            return flush();
        },
        flush,
        async status(): Promise<ExtensionSyncStatus> {
            return visibleStatus(await storage.load(), now());
        },
    };
}