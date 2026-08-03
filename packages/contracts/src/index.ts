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
    coordinateSpace: z.literal("viewport-css-pixels"),
    hidden: z.boolean().default(false),
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

export const ExtensionMessageSchema = z.union([
    RecordingRequestMessageSchema,
    RecordingResponseMessageSchema,
    RecordingEventMessageSchema,
]);

export type CaptureActionType = z.infer<typeof CaptureActionTypeSchema>;
export type ElementRect = z.infer<typeof ElementRectSchema>;
export type ElementMetadata = z.infer<typeof ElementMetadataSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;
export type ScreenshotMetadata = z.infer<typeof ScreenshotMetadataSchema>;
export type HighlightMetadata = z.infer<typeof HighlightMetadataSchema>;
export type CapturedStep = z.infer<typeof CapturedStepSchema>;
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>;
export type RecordingSession = z.infer<typeof RecordingSessionSchema>;
export type RecordingRequestMessage = z.infer<
    typeof RecordingRequestMessageSchema
>;
export type RecordingResponseMessage = z.infer<
    typeof RecordingResponseMessageSchema
>;
export type RecordingEventMessage = z.infer<
    typeof RecordingEventMessageSchema
>;
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
