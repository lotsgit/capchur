import type { RecordingSession } from "./contracts";

export type RecordingStateCommand =
    | { type: "start" }
    | { type: "stop"; sessionId: string }
    | { type: "resume"; sessionId: string }
    | { type: "clear"; sessionId: string };

export type RecordingStateTransition =
    | { action: "persist"; session: RecordingSession }
    | { action: "clear"; session: null };

export class RecordingStateError extends Error {
    readonly code = "SESSION_NOT_FOUND" as const;

    constructor() {
        super("The recording session was not found.");
        this.name = "RecordingStateError";
    }
}

export function transitionRecordingState(
    currentSession: RecordingSession | null,
    command: RecordingStateCommand,
    now: number,
    createId: () => string,
): RecordingStateTransition {
    if (command.type === "start") {
        return {
            action: "persist",
            session: currentSession ?? {
                id: createId(),
                status: "recording",
                startedAt: now,
                updatedAt: now,
                steps: [],
            },
        };
    }

    if (!currentSession || currentSession.id !== command.sessionId) {
        throw new RecordingStateError();
    }

    if (command.type === "clear") {
        return { action: "clear", session: null };
    }

    const status = command.type === "resume" ? "recording" : "stopped";
    return {
        action: "persist",
        session: {
            ...currentSession,
            status,
            updatedAt: now,
        },
    };
}