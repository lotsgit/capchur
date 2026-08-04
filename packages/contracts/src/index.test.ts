import { describe, expect, it } from "vitest";

import {
    AiDescriptionEnhancementRequestSchema,
    AiDescriptionEnhancementResponseSchema,
    AiDescriptionProviderOutputSchema,
    CONTRACT_VERSION,
    CapturedStepSchema,
    ClickCaptureSchema,
    ExtensionMessageSchema,
    ExportJobRequestSchema,
    ExportJobSchema,
    GuideAccessSchema,
    GuideCommentCreateSchema,
    GuideRevisionRestoreSchema,
    GuideShareCreateSchema,
    GuideUpdateRequestSchema,
    GuideWriteSchema,
    GuideSchema,
    ImageUploadIntentSchema,
    LocalSessionArchiveSchema,
    RecordingRequestMessageSchema,
    RecordingResponseMessageSchema,
    RecordingSessionSchema,
} from "./index";

describe("AI description contracts", () => {
    it("accepts only explicit consent and privacy-minimized context", () => {
        const request = {
            consent: true,
            deterministicDescription: "Click the button",
            stepTitle: "Continue",
            section: null,
        } as const;

        expect(AiDescriptionEnhancementRequestSchema.parse(request)).toEqual(request);
        expect(AiDescriptionEnhancementRequestSchema.safeParse({ ...request, consent: false }).success)
            .toBe(false);
        expect(AiDescriptionEnhancementRequestSchema.safeParse({ ...request, pageHtml: "<form>" }).success)
            .toBe(false);
    });

    it("requires structured provider output and explicit fallback metadata", () => {
        expect(AiDescriptionProviderOutputSchema.safeParse({ description: "Select Continue." }).success)
            .toBe(true);
        expect(AiDescriptionProviderOutputSchema.safeParse({ description: "", toolCall: "read-page" }).success)
            .toBe(false);
        expect(AiDescriptionEnhancementResponseSchema.safeParse({
            description: "Click the button",
            source: "deterministic",
            fallbackReason: "provider-failure",
        }).success).toBe(true);
    });
});

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

const validGuide = {
    version: CONTRACT_VERSION,
    id: "0198f1d0-c184-7000-8000-000000000004",
    title: "Publish a product update",
    description: "Prepare and publish a release note.",
    introduction: "",
    branding: { name: "", accentColor: "#164c3b", logoUrl: null },
    updatedAt: 1_754_000_000_200,
    steps: [{
        id: "0198f1d0-c184-7000-8000-000000000005",
        position: 0,
        title: "Open the release editor",
        description: "Choose Releases from the workspace navigation.",
        section: null,
        media: {
            type: "image",
            source: "/fixtures/release-editor.png",
            width: 1440,
            height: 900,
            alt: "Release editor with Releases highlighted",
        },
        annotation: {
            rect: { x: 48, y: 190, width: 176, height: 44 },
            coordinateSpace: "image-pixels",
            hidden: false,
            crop: null,
            redactions: [],
        },
    }],
} as const;

describe("domain contracts", () => {
    it("parses a complete recording session", () => {
        expect(RecordingSessionSchema.parse(validSession)).toEqual(validSession);
    });

    it("parses editable highlights in screenshot pixel coordinates", () => {
        const step = {
            ...validStep,
            highlight: {
                ...validStep.highlight,
                coordinateSpace: "screenshot-pixels",
            },
        };

        expect(CapturedStepSchema.parse(step).highlight).toEqual(step.highlight);
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

    it("rejects screenshot coordinates from an untrusted click capture", () => {
        expect(ClickCaptureSchema.safeParse({
            ...validClickCapture,
            highlight: {
                ...validClickCapture.highlight,
                coordinateSpace: "screenshot-pixels",
            },
        }).success).toBe(false);
    });
});

describe("local session review contracts", () => {
    it("accepts review mutations and rejects incomplete reorder commands", () => {
        expect(RecordingRequestMessageSchema.safeParse({
            version: CONTRACT_VERSION,
            type: "recording.step.update",
            requestId,
            sessionId,
            stepId,
            description: "Click Save changes",
        }).success).toBe(true);

        expect(RecordingRequestMessageSchema.safeParse({
            version: CONTRACT_VERSION,
            type: "recording.steps.reorder",
            requestId,
            sessionId,
        }).success).toBe(false);
    });

    it("validates portable archives and their screenshot payloads", () => {
        const archive = {
            version: CONTRACT_VERSION,
            exportedAt: 300,
            session: validSession,
            screenshots: [{
                storageKey: `screenshots/${sessionId}/${stepId}`,
                dataUrl: "data:image/png;base64,iVBORw0KGgo=",
            }],
        };

        expect(LocalSessionArchiveSchema.safeParse(archive).success).toBe(true);
        expect(LocalSessionArchiveSchema.safeParse({
            ...archive,
            screenshots: [{ storageKey: "image", dataUrl: "https://example.com/image.png" }],
        }).success).toBe(false);
    });
});

describe("guide domain contracts", () => {
    it("validates export requests and durable job states", () => {
        expect(ExportJobRequestSchema.parse({ format: "pdf" })).toEqual({ format: "pdf" });
        expect(ExportJobRequestSchema.safeParse({ format: "html" }).success).toBe(false);
        expect(ExportJobSchema.safeParse({
            id: requestId,
            guideId: validGuide.id,
            format: "docx",
            status: "completed",
            attempts: 1,
            createdAt: 100,
            updatedAt: 200,
            expiresAt: 300,
            error: null,
            downloadUrl: "/api/exports/download?token=signed",
        }).success).toBe(true);
    });

    it("parses an editable guide without capture transport fields", () => {
        expect(GuideSchema.parse(validGuide)).toEqual(validGuide);
        expect("sessionId" in validGuide.steps[0]).toBe(false);
        expect("element" in validGuide.steps[0]).toBe(false);
    });

    it("rejects duplicate positions and capture-only fields", () => {
        expect(GuideSchema.safeParse({
            ...validGuide,
            steps: [
                validGuide.steps[0],
                { ...validGuide.steps[0], id: stepId },
            ],
        }).success).toBe(false);

        expect(GuideSchema.safeParse({
            ...validGuide,
            steps: [{ ...validGuide.steps[0], sessionId }],
        }).success).toBe(false);
    });

    it("validates persistence writes without accepting server-owned fields", () => {
        const { id: _id, updatedAt: _updatedAt, version: _version, ...write } = validGuide;

        expect(GuideWriteSchema.parse(write)).toEqual(write);
        expect(GuideWriteSchema.safeParse(validGuide).success).toBe(false);
        expect(GuideUpdateRequestSchema.safeParse({
            updatedAt: validGuide.updatedAt,
            guide: write,
        }).success).toBe(true);
        expect(GuideUpdateRequestSchema.safeParse(write).success).toBe(false);
    });

    it("validates bounded collaboration mutations and rejects extra fields", () => {
        expect(GuideAccessSchema.parse({ visibility: "workspace" })).toEqual({
            visibility: "workspace",
        });
        expect(GuideAccessSchema.safeParse({ visibility: "public" }).success).toBe(false);
        expect(GuideShareCreateSchema.safeParse({ expiresAt: null, token: "client-token" }).success)
            .toBe(false);
        expect(GuideCommentCreateSchema.safeParse({ body: " " }).success).toBe(false);
        expect(GuideRevisionRestoreSchema.safeParse({
            revisionId: requestId,
            updatedAt: validGuide.updatedAt,
        }).success).toBe(true);
        expect(GuideRevisionRestoreSchema.safeParse({ revisionId: requestId }).success).toBe(false);
    });

    it("normalizes editable privacy and presentation metadata", () => {
        const parsed = GuideSchema.parse({
            ...validGuide,
            introduction: "Before you begin",
            branding: { name: "Capchur", accentColor: "#164c3b", logoUrl: null },
            steps: [{
                ...validGuide.steps[0],
                section: "Preparation",
                annotation: {
                    rect: { x: 10, y: 20, width: 30, height: 40 },
                    coordinateSpace: "image-pixels",
                    crop: { x: 0, y: 0, width: 800, height: 600 },
                    redactions: [{
                        id: "0198f1d0-c184-7000-8000-000000000099",
                        rect: { x: 50, y: 60, width: 70, height: 80 },
                    }],
                },
            }],
        });

        expect(parsed.steps[0].annotation?.hidden).toBe(false);
        expect(parsed.steps[0].annotation?.redactions).toHaveLength(1);
        expect(parsed.branding.name).toBe("Capchur");
    });

    it("rejects invalid crop, redaction, and branding values", () => {
        expect(GuideSchema.safeParse({
            ...validGuide,
            branding: { accentColor: "red" },
        }).success).toBe(false);
        expect(GuideSchema.safeParse({
            ...validGuide,
            steps: [{
                ...validGuide.steps[0],
                annotation: {
                    rect: { x: 0, y: 0, width: 0, height: 10 },
                    coordinateSpace: "image-pixels",
                },
            }],
        }).success).toBe(false);
    });

    it("validates bounded image upload intents", () => {
        const intent = {
            guideId: validGuide.id,
            stepId: validGuide.steps[0].id,
            mimeType: "image/png",
            byteLength: 1024,
            sha256: "a".repeat(64),
        };

        expect(ImageUploadIntentSchema.parse(intent)).toEqual(intent);
        expect(ImageUploadIntentSchema.safeParse({
            ...intent,
            byteLength: 26 * 1024 * 1024,
        }).success).toBe(false);
    });
});