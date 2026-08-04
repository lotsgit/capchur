import { z } from "zod";

export const CONTRACT_VERSION = 1 as const;

const IdSchema = z.string().uuid();
const TimestampSchema = z.number().int().nonnegative();
const NonEmptyStringSchema = z.string().trim().min(1).max(2_000);
const HttpUrlSchema = z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
}, "Only HTTP(S) URLs are supported");

export const CaptureActionTypeSchema = z.enum([
    "click",
    "input",
    "select",
    "submit",
    "keypress",
]);

export const ElementRectSchema = z.strictObject({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
});

export const ElementMetadataSchema = z.strictObject({
    tagName: z.string().trim().min(1).max(100),
    accessibleName: z.string().trim().max(500).optional(),
    role: z.string().trim().min(1).max(100).optional(),
    selectors: z.array(NonEmptyStringSchema).max(10),
});

export const ViewportSchema = z.strictObject({
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    scrollX: z.number().finite(),
    scrollY: z.number().finite(),
    devicePixelRatio: z.number().finite().positive(),
    zoom: z.number().finite().positive(),
    visualViewport: z.strictObject({
        width: z.number().finite().positive(),
        height: z.number().finite().positive(),
        offsetLeft: z.number().finite(),
        offsetTop: z.number().finite(),
        scale: z.number().finite().positive(),
    }),
});

export const ScreenshotMetadataSchema = z.strictObject({
    id: IdSchema,
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    capturedAt: TimestampSchema,
    storageKey: NonEmptyStringSchema.optional(),
});

export const HighlightMetadataSchema = z.strictObject({
    rect: ElementRectSchema,
    coordinateSpace: z.enum(["viewport-css-pixels", "screenshot-pixels"]),
    hidden: z.boolean().default(false),
});

const ViewportHighlightMetadataSchema = HighlightMetadataSchema.extend({
    coordinateSpace: z.literal("viewport-css-pixels"),
});

export const CapturedStepSchema = z.strictObject({
    id: IdSchema,
    sessionId: IdSchema,
    sequence: z.number().int().nonnegative(),
    action: CaptureActionTypeSchema,
    timestamp: TimestampSchema,
    url: HttpUrlSchema,
    pageTitle: z.string().trim().max(1_000),
    description: NonEmptyStringSchema,
    element: ElementMetadataSchema,
    viewport: ViewportSchema,
    screenshot: ScreenshotMetadataSchema.nullable(),
    highlight: HighlightMetadataSchema,
});

export const ClickCaptureSchema = z.strictObject({
    timestamp: TimestampSchema,
    url: HttpUrlSchema,
    pageTitle: z.string().trim().max(1_000),
    description: NonEmptyStringSchema,
    element: ElementMetadataSchema,
    viewport: ViewportSchema,
    highlight: ViewportHighlightMetadataSchema,
});

export const RecordingStatusSchema = z.enum([
    "recording",
    "paused",
    "stopped",
]);

export const RecordingSessionSchema = z.strictObject({
    id: IdSchema,
    status: RecordingStatusSchema,
    startedAt: TimestampSchema,
    updatedAt: TimestampSchema,
    steps: z.array(CapturedStepSchema),
});

export const LocalSessionArchiveSchema = z.strictObject({
    version: z.literal(CONTRACT_VERSION),
    exportedAt: TimestampSchema,
    session: RecordingSessionSchema,
    screenshots: z.array(z.strictObject({
        storageKey: NonEmptyStringSchema,
        dataUrl: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
    })),
});

const GuideMediaSourceSchema = z.string().trim().min(1).max(2_000).refine(
    (value) => value.startsWith("/") || HttpUrlSchema.safeParse(value).success,
    "Guide media must use an absolute application path or HTTP(S) URL",
);

export const GuideMediaSchema = z.strictObject({
    type: z.literal("image"),
    source: GuideMediaSourceSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    alt: z.string().trim().max(500),
});

const ImageRectSchema = ElementRectSchema.refine(
    ({ x, y, width, height }) => x >= 0 && y >= 0 && width > 0 && height > 0,
    "Image rectangles must have a positive size and nonnegative origin",
);

export const GuideRedactionSchema = z.strictObject({
    id: IdSchema,
    rect: ImageRectSchema,
});

export const GuideAnnotationSchema = z.strictObject({
    rect: ImageRectSchema,
    coordinateSpace: z.literal("image-pixels"),
    hidden: z.boolean().default(false),
    crop: ImageRectSchema.nullable().default(null),
    redactions: z.array(GuideRedactionSchema).max(100).default([]),
});

export const GuideStepSchema = z.strictObject({
    id: IdSchema,
    position: z.number().int().nonnegative(),
    title: NonEmptyStringSchema,
    description: z.string().trim().max(5_000),
    section: z.string().trim().max(200).nullable().default(null),
    media: GuideMediaSchema.nullable(),
    annotation: GuideAnnotationSchema.nullable(),
});

export const GuideBrandingSchema = z.strictObject({
    name: z.string().trim().max(200).default(""),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#164c3b"),
    logoUrl: GuideMediaSourceSchema.nullable().default(null),
});

export const GuideSchema = z.strictObject({
    version: z.literal(CONTRACT_VERSION),
    id: IdSchema,
    title: NonEmptyStringSchema,
    description: z.string().trim().max(5_000),
    introduction: z.string().trim().max(10_000).default(""),
    branding: GuideBrandingSchema.default({
        name: "",
        accentColor: "#164c3b",
        logoUrl: null,
    }),
    updatedAt: TimestampSchema,
    steps: z.array(GuideStepSchema).max(500),
}).superRefine((guide, context) => {
    const positions = new Set<number>();

    for (const step of guide.steps) {
        if (positions.has(step.position)) {
            context.addIssue({
                code: "custom",
                message: "Guide step positions must be unique",
                path: ["steps"],
            });
            return;
        }

        positions.add(step.position);
    }
});

export const GuideWriteSchema = z.strictObject({
    title: NonEmptyStringSchema,
    description: z.string().trim().max(5_000),
    introduction: z.string().trim().max(10_000).default(""),
    branding: GuideBrandingSchema.default({
        name: "",
        accentColor: "#164c3b",
        logoUrl: null,
    }),
    steps: z.array(GuideStepSchema).max(500),
}).superRefine((guide, context) => {
    const positions = new Set<number>();

    for (const step of guide.steps) {
        if (positions.has(step.position)) {
            context.addIssue({
                code: "custom",
                message: "Guide step positions must be unique",
                path: ["steps"],
            });
            return;
        }

        positions.add(step.position);
    }
});

export const GuideUpdateRequestSchema = z.strictObject({
    updatedAt: TimestampSchema,
    guide: GuideWriteSchema,
});

export const RecordingSessionWriteSchema = z.strictObject({
    session: RecordingSessionSchema,
});

export const ExtensionAuthorizationExchangeSchema = z.strictObject({
    code: z.string().trim().min(32).max(512),
});

export const ExtensionAuthorizationSchema = z.strictObject({
    accessToken: z.string().trim().min(32).max(512),
    expiresAt: TimestampSchema,
});

export const SessionSyncRequestSchema = z.strictObject({
    idempotencyKey: z.string().uuid(),
    session: RecordingSessionSchema,
});

export const SessionSyncResponseSchema = z.strictObject({
    guideId: IdSchema,
    sessionId: IdSchema,
    syncedAt: TimestampSchema,
});

export const SessionImageAttachmentSchema = z.strictObject({
    stepId: IdSchema,
    objectKey: NonEmptyStringSchema,
});

export const ExtensionSyncStateSchema = z.enum([
    "disconnected",
    "pending",
    "syncing",
    "retrying",
    "conflict",
    "synced",
]);

export const ExtensionSyncStatusSchema = z.strictObject({
    state: ExtensionSyncStateSchema,
    sessionId: IdSchema.nullable(),
    guideId: IdSchema.nullable(),
    attempts: z.number().int().nonnegative(),
    nextAttemptAt: TimestampSchema.nullable(),
    message: z.string().trim().max(2_000).nullable(),
});

export const ImageUploadIntentSchema = z.strictObject({
    guideId: IdSchema,
    stepId: IdSchema,
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    byteLength: z.number().int().positive().max(25 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const SignedImageUploadSchema = z.strictObject({
    objectKey: NonEmptyStringSchema,
    uploadUrl: z.string().trim().min(1).max(4_000),
    method: z.literal("PUT"),
    expiresAt: TimestampSchema,
    headers: z.record(z.string(), z.string()),
});

export const SignedImageDownloadSchema = z.strictObject({
    downloadUrl: z.string().trim().min(1).max(4_000),
    expiresAt: TimestampSchema,
});

const MessageBaseShape = {
    version: z.literal(CONTRACT_VERSION),
    requestId: IdSchema,
};

export const RecordingRequestMessageSchema = z.discriminatedUnion("type", [
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("recording.start"),
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("recording.stop"),
        sessionId: IdSchema,
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("recording.resume"),
        sessionId: IdSchema,
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("recording.status"),
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("recording.clear"),
        sessionId: IdSchema,
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("recording.step.update"),
        sessionId: IdSchema,
        stepId: IdSchema,
        description: NonEmptyStringSchema,
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("recording.step.delete"),
        sessionId: IdSchema,
        stepId: IdSchema,
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("recording.steps.reorder"),
        sessionId: IdSchema,
        stepIds: z.array(IdSchema),
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("recording.import"),
        session: RecordingSessionSchema,
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("recording.screenshot.retry"),
        sessionId: IdSchema,
        stepId: IdSchema,
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("capture.click"),
        capture: ClickCaptureSchema,
    }),
]);

const RecordingResponseBaseShape = {
    ...MessageBaseShape,
    type: z.literal("recording.response"),
};

export const RecordingResponseMessageSchema = z.discriminatedUnion("ok", [
    z.strictObject({
        ...RecordingResponseBaseShape,
        ok: z.literal(true),
        session: RecordingSessionSchema.nullable(),
    }),
    z.strictObject({
        ...RecordingResponseBaseShape,
        ok: z.literal(false),
        error: z.strictObject({
            code: z.enum([
                "INVALID_MESSAGE",
                "SESSION_NOT_FOUND",
                "STEP_NOT_FOUND",
                "SCREENSHOT_UNAVAILABLE",
                "STORAGE_ERROR",
                "UNEXPECTED_ERROR",
            ]),
            message: NonEmptyStringSchema,
        }),
    }),
]);

export const RecordingEventMessageSchema = z.discriminatedUnion("type", [
    z.strictObject({
        version: z.literal(CONTRACT_VERSION),
        type: z.literal("recording.changed"),
        session: RecordingSessionSchema,
    }),
    z.strictObject({
        version: z.literal(CONTRACT_VERSION),
        type: z.literal("capture.step"),
        step: CapturedStepSchema,
    }),
]);

export const SyncRequestMessageSchema = z.discriminatedUnion("type", [
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("sync.authorize"),
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("sync.enqueue"),
        session: RecordingSessionSchema,
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("sync.retry"),
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("sync.status"),
    }),
    z.strictObject({
        ...MessageBaseShape,
        type: z.literal("sync.open"),
        guideId: IdSchema,
    }),
]);

export const SyncResponseMessageSchema = z.strictObject({
    ...MessageBaseShape,
    type: z.literal("sync.response"),
    ok: z.boolean(),
    status: ExtensionSyncStatusSchema,
});

export const ExtensionMessageSchema = z.union([
    RecordingRequestMessageSchema,
    RecordingResponseMessageSchema,
    RecordingEventMessageSchema,
    SyncRequestMessageSchema,
    SyncResponseMessageSchema,
]);

export type CaptureActionType = z.infer<typeof CaptureActionTypeSchema>;
export type ElementRect = z.infer<typeof ElementRectSchema>;
export type ElementMetadata = z.infer<typeof ElementMetadataSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;
export type ScreenshotMetadata = z.infer<typeof ScreenshotMetadataSchema>;
export type HighlightMetadata = z.infer<typeof HighlightMetadataSchema>;
export type CapturedStep = z.infer<typeof CapturedStepSchema>;
export type ClickCapture = z.infer<typeof ClickCaptureSchema>;
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>;
export type RecordingSession = z.infer<typeof RecordingSessionSchema>;
export type LocalSessionArchive = z.infer<typeof LocalSessionArchiveSchema>;
export type ExtensionAuthorizationExchange = z.infer<typeof ExtensionAuthorizationExchangeSchema>;
export type ExtensionAuthorization = z.infer<typeof ExtensionAuthorizationSchema>;
export type SessionSyncRequest = z.infer<typeof SessionSyncRequestSchema>;
export type SessionSyncResponse = z.infer<typeof SessionSyncResponseSchema>;
export type SessionImageAttachment = z.infer<typeof SessionImageAttachmentSchema>;
export type ExtensionSyncState = z.infer<typeof ExtensionSyncStateSchema>;
export type ExtensionSyncStatus = z.infer<typeof ExtensionSyncStatusSchema>;
export type GuideMedia = z.infer<typeof GuideMediaSchema>;
export type GuideAnnotation = z.infer<typeof GuideAnnotationSchema>;
export type GuideBranding = z.infer<typeof GuideBrandingSchema>;
export type GuideStep = z.infer<typeof GuideStepSchema>;
export type Guide = z.infer<typeof GuideSchema>;
export type GuideWrite = z.infer<typeof GuideWriteSchema>;
export type GuideUpdateRequest = z.infer<typeof GuideUpdateRequestSchema>;
export type RecordingSessionWrite = z.infer<typeof RecordingSessionWriteSchema>;
export type ImageUploadIntent = z.infer<typeof ImageUploadIntentSchema>;
export type SignedImageUpload = z.infer<typeof SignedImageUploadSchema>;
export type SignedImageDownload = z.infer<typeof SignedImageDownloadSchema>;
export type RecordingRequestMessage = z.infer<
    typeof RecordingRequestMessageSchema
>;
export type RecordingResponseMessage = z.infer<
    typeof RecordingResponseMessageSchema
>;
export type RecordingEventMessage = z.infer<
    typeof RecordingEventMessageSchema
>;
export type SyncRequestMessage = z.infer<typeof SyncRequestMessageSchema>;
export type SyncResponseMessage = z.infer<typeof SyncResponseMessageSchema>;
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
