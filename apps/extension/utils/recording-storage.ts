import { RecordingSessionSchema } from "@capchur/contracts";

import type { RecordingSession } from "./contracts";

const RECORDING_SESSION_KEY = "recordingSession";

export interface ExtensionStorageArea {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(key: string): Promise<void>;
}

export interface RecordingStorage {
    load(): Promise<RecordingSession | null>;
    save(session: RecordingSession): Promise<void>;
    clear(): Promise<void>;
}

export function createRecordingStorage(
    storageArea: ExtensionStorageArea,
): RecordingStorage {
    return {
        async load() {
            const stored = (await storageArea.get(RECORDING_SESSION_KEY))[
                RECORDING_SESSION_KEY
            ];
            if (stored === undefined) {
                return null;
            }

            const result = RecordingSessionSchema.safeParse(stored);
            if (result.success) {
                return result.data;
            }

            await storageArea.remove(RECORDING_SESSION_KEY);
            return null;
        },
        async save(session) {
            const validatedSession = RecordingSessionSchema.parse(session);
            await storageArea.set({
                [RECORDING_SESSION_KEY]: validatedSession,
            });
        },
        async clear() {
            await storageArea.remove(RECORDING_SESSION_KEY);
        },
    };
}