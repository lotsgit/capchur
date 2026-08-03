import { describe, expect, it } from "vitest";

import {
    CONTRACT_VERSION,
    RecordingRequestMessageSchema,
    type RecordingRequestMessage,
} from "./contracts";

describe("extension contract boundary", () => {
    it("accepts a typed recording request", () => {
        const request: RecordingRequestMessage = {
            version: CONTRACT_VERSION,
            type: "recording.start",
            requestId: "0198f1d0-c184-7000-8000-000000000001",
        };

        expect(RecordingRequestMessageSchema.parse(request)).toEqual(request);
    });

    it("rejects untrusted malformed messages", () => {
        expect(
            RecordingRequestMessageSchema.safeParse({
                version: CONTRACT_VERSION,
                type: "recording.start",
                requestId: "not-a-uuid",
            }).success,
        ).toBe(false);
    });
});