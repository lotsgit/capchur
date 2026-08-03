import { describe, expect, it } from "vitest";

import {
    CONTRACT_VERSION,
    CapturedStepSchema,
    ClickCaptureSchema,
    ExtensionMessageSchema,
    RecordingRequestMessageSchema,
    RecordingResponseMessageSchema,
    RecordingSessionSchema,
} from "./index";

const requestId = "0198f1d0-c184-7000-8000-000000000001";
const sessionId = "0198f1d0-c184-7000-8000-000000000002";
const stepId = "0198f1d0-c184-7000-8000-000000000003";

const validStep = {
    id: stepId,
    sessionId,
    sequence: 0,
    action: "click",
    timestamp: 1_754_000_000_000,
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
        scrollY: 120,
        devicePixelRatio: 2,
        zoom: 1,
        visualViewport: {
            width: 1280,
            height: 720,
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
} as const;

const validSession = {
    id: sessionId,
    status: "recording",
    startedAt: 1_754_000_000_000,
    updatedAt: 1_754_000_000_100,
    steps: [validStep],
} as const;

const validClickCapture = {
    timestamp: validStep.timestamp,
    url: validStep.url,
    pageTitle: validStep.pageTitle,
    description: validStep.description,
    element: validStep.element,
    viewport: validStep.viewport,
    highlight: validStep.highlight,
} as const;

describe("domain contracts", () => {
    it("parses a complete recording session", () => {
        expect(RecordingSessionSchema.parse(validSession)).toEqual(validSession);
    });

    it("rejects a step when a required contract field is removed", () => {
        const { description: _description, ...incompleteStep } = validStep;

        expect(CapturedStepSchema.safeParse(incompleteStep).success).toBe(false);
    });

    it.each([
        ["raw input value", { ...validStep.element, value: "secret" }],
        ["password", { ...validStep.element, password: "secret" }],
        ["raw HTML", { ...validStep.element, innerHTML: "<b>secret</b>" }],
    ])("rejects sensitive element metadata: %s", (_name, element) => {
        expect(
            CapturedStepSchema.safeParse({ ...validStep, element }).success,
        ).toBe(false);
    });
});

describe("extension message contracts", () => {
    it("parses versioned request, response, and event messages", () => {
        const messages = [
            {
                version: CONTRACT_VERSION,
                type: "recording.start",
                requestId,
            },
            {
                version: CONTRACT_VERSION,
                type: "recording.response",
                requestId,
                ok: true,
                session: validSession,
            },
            {
                version: CONTRACT_VERSION,
                type: "capture.click",
                requestId,
                capture: validClickCapture,
            },
        ];

        for (const message of messages) {
            expect(ExtensionMessageSchema.safeParse(message).success).toBe(true);
        }
    });

    it("rejects unsupported message versions", () => {
        expect(
            RecordingRequestMessageSchema.safeParse({
                version: 2,
                type: "recording.start",
                requestId,
            }).success,
        ).toBe(false);
    });

    it("rejects malformed request and response envelopes", () => {
        expect(
            RecordingRequestMessageSchema.safeParse({
                version: CONTRACT_VERSION,
                type: "recording.stop",
                requestId,
            }).success,
        ).toBe(false);

        expect(
            RecordingResponseMessageSchema.safeParse({
                version: CONTRACT_VERSION,
                type: "recording.response",
                requestId,
                ok: false,
                error: { code: "UNKNOWN", message: "Failed" },
            }).success,
        ).toBe(false);
    });

    it("rejects sensitive fields added to a message envelope", () => {
        expect(
            RecordingRequestMessageSchema.safeParse({
                version: CONTRACT_VERSION,
                type: "recording.start",
                requestId,
                token: "secret",
            }).success,
        ).toBe(false);
    });

    it("accepts only sanitized, unpersisted click capture fields", () => {
        expect(ClickCaptureSchema.parse(validClickCapture)).toEqual(validClickCapture);
        expect(
            RecordingRequestMessageSchema.safeParse({
                version: CONTRACT_VERSION,
                type: "capture.click",
                requestId,
                capture: { ...validClickCapture, id: stepId, value: "secret" },
            }).success,
        ).toBe(false);
    });
});