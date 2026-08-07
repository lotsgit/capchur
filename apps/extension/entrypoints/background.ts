import {
    CONTRACT_VERSION,
    ExtensionAuthorizationSchema,
    RecordingRequestMessageSchema,
    SignedImageUploadSchema,
    SyncRequestMessageSchema,
    type SyncRequestMessage,
    type SyncResponseMessage,
} from "../utils/contracts";
import { createRecordingMessageHandler } from "../utils/recording-messages";
import { createRecordingStorage } from "../utils/recording-storage";
import { createScreenshotCapture } from "../utils/screenshot-capture";
import { createScreenshotStorage } from "../utils/screenshot-storage";
import { createSyncQueue, SyncTransportError } from "../utils/sync-queue";

const WEB_ORIGIN = import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000";
const SYNC_RETRY_ALARM = "capchur-sync-retry";

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

export default defineBackground(() => {
    const screenshotStorage = createScreenshotStorage();
    const attachScreenshot = createScreenshotCapture({
        captureVisibleTab: (windowId) => browser.tabs.captureVisibleTab(windowId, {
            format: "png",
        }),
        async ensureTabActive(tabId, windowId) {
            const tab = await browser.tabs.get(tabId);
            return tab.active && tab.windowId === windowId;
        },
        getZoom: (tabId) => browser.tabs.getZoom(tabId),
        saveImage: (storageKey, dataUrl) => screenshotStorage.save(storageKey, dataUrl),
    });
    const handleMessage = createRecordingMessageHandler(
        createRecordingStorage(browser.storage.local),
        {
            attachScreenshot,
            async retryScreenshot(step) {
                const tabs = await browser.tabs.query({});
                const sourceTab = tabs.find((tab) => tab.url === step.url && tab.id !== undefined);
                if (sourceTab?.id === undefined || sourceTab.windowId === undefined) {
                    throw new Error("Open the source page in a browser tab before retrying.");
                }

                const previouslyActiveTab = tabs.find((tab) =>
                    tab.active && tab.windowId === sourceTab.windowId,
                );
                try {
                    if (!sourceTab.active) {
                        await browser.tabs.update(sourceTab.id, { active: true });
                    }
                    return await attachScreenshot(step, {
                        tabId: sourceTab.id,
                        windowId: sourceTab.windowId,
                    });
                } finally {
                    if (previouslyActiveTab?.id !== undefined && previouslyActiveTab.id !== sourceTab.id) {
                        await browser.tabs.update(previouslyActiveTab.id, { active: true });
                    }
                }
            },
            deleteScreenshot: (storageKey) => screenshotStorage.delete(storageKey),
            clearScreenshots: () => screenshotStorage.clear(),
        },
    );

    const syncQueue = createSyncQueue(browser.storage.local, {
        async authorize() {
            const redirectUri = browser.identity.getRedirectURL("capchur");
            const authorizationUrl = new URL("/extension/connect", WEB_ORIGIN);
            authorizationUrl.searchParams.set("redirect_uri", redirectUri);
            const callbackUrl = await browser.identity.launchWebAuthFlow({
                url: authorizationUrl.toString(),
                interactive: true,
            });
            if (!callbackUrl) throw new Error("Extension authorization was cancelled.");
            const code = new URL(callbackUrl).searchParams.get("code");
            if (!code) throw new Error("The authorization response was invalid.");
            const response = await fetch(new URL("/api/extension/exchange", WEB_ORIGIN), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ code, includeUserName: true }),
            });
            if (!response.ok) throw new Error("Extension authorization expired. Try again.");
            return ExtensionAuthorizationSchema.parse(await response.json());
        },
        async upload(accessToken, request, uploadedStepIds, markStepUploaded) {
            let response: Response;
            try {
                response = await fetch(
                    new URL(`/api/sync/sessions/${request.session.id}`, WEB_ORIGIN),
                    {
                        method: "PUT",
                        headers: {
                            authorization: `Bearer ${accessToken}`,
                            "content-type": "application/json",
                        },
                        body: JSON.stringify(request),
                    },
                );
            } catch {
                throw new SyncTransportError("offline", "Offline. Retry scheduled.");
            }
            if (response.status === 401) {
                throw new SyncTransportError("unauthorized", "Session expired.");
            }
            if (response.status === 409) {
                throw new SyncTransportError("conflict", "A newer cloud revision exists.");
            }
            if (!response.ok) {
                throw new SyncTransportError("server", "Upload failed. Retry scheduled.");
            }
            const syncedSession = await response.json();
            const guideId = typeof syncedSession === "object" && syncedSession !== null &&
                typeof (syncedSession as { guideId?: unknown }).guideId === "string"
                ? (syncedSession as { guideId: string }).guideId
                : null;
            if (!guideId) throw new SyncTransportError("server", "Sync response was invalid.");

            for (const step of request.session.steps) {
                const storageKey = step.screenshot?.storageKey;
                if (!storageKey || uploadedStepIds.includes(step.id)) continue;
                const image = await screenshotStorage.load(storageKey);
                if (!image) {
                    await markStepUploaded(step.id);
                    continue;
                }
                const bytes = await image.arrayBuffer();
                const intentResponse = await fetch(new URL("/api/images/upload-intent", WEB_ORIGIN), {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${accessToken}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        guideId,
                        stepId: step.id,
                        mimeType: step.screenshot?.mimeType,
                        byteLength: bytes.byteLength,
                        sha256: await sha256Hex(bytes),
                    }),
                });
                if (intentResponse.status === 401) {
                    throw new SyncTransportError("unauthorized", "Session expired.");
                }
                if (!intentResponse.ok) {
                    throw new SyncTransportError("server", "Screenshot upload failed. Retry scheduled.");
                }
                const intent = SignedImageUploadSchema.parse(await intentResponse.json());
                const uploadResponse = await fetch(new URL(intent.uploadUrl, WEB_ORIGIN), {
                    method: intent.method,
                    headers: intent.headers,
                    body: bytes,
                });
                if (!uploadResponse.ok) {
                    throw new SyncTransportError("server", "Screenshot upload failed. Retry scheduled.");
                }
                const attachResponse = await fetch(
                    new URL(`/api/sync/sessions/${request.session.id}/images`, WEB_ORIGIN),
                    {
                        method: "POST",
                        headers: {
                            authorization: `Bearer ${accessToken}`,
                            "content-type": "application/json",
                        },
                        body: JSON.stringify({ stepId: step.id, objectKey: intent.objectKey }),
                    },
                );
                if (!attachResponse.ok) {
                    throw new SyncTransportError("server", "Screenshot attachment failed. Retry scheduled.");
                }
                await markStepUploaded(step.id);
            }
            return syncedSession;
        },
    }, async (when) => {
        await browser.alarms.create(SYNC_RETRY_ALARM, { when });
    });

    async function handleSyncRequest(message: SyncRequestMessage): Promise<SyncResponseMessage> {
        let status;
        let ok = true;
        try {
            if (message.type === "sync.authorize") status = await syncQueue.authorize();
            else if (message.type === "sync.enqueue") status = await syncQueue.enqueue(message.session);
            else if (message.type === "sync.retry") status = await syncQueue.flush();
            else if (message.type === "sync.open") {
                await browser.tabs.create({ url: `${WEB_ORIGIN}/?guideId=${message.guideId}` });
                status = await syncQueue.status();
            } else status = await syncQueue.status();
        } catch (error) {
            ok = false;
            status = {
                ...(await syncQueue.status()),
                message: error instanceof Error ? error.message : "Sync failed.",
            };
        }
        return {
            version: CONTRACT_VERSION,
            requestId: message.requestId,
            type: "sync.response",
            ok,
            status,
        };
    }

    browser.runtime.onMessage.addListener((message, sender) => {
        const syncRequest = SyncRequestMessageSchema.safeParse(message);
        if (syncRequest.success) return handleSyncRequest(syncRequest.data);
        const recordingRequest = RecordingRequestMessageSchema.safeParse(message);
        const response = handleMessage(message, {
            url: sender.url ?? sender.tab?.url,
            tabId: sender.tab?.id,
            windowId: sender.tab?.windowId,
        });
        if (recordingRequest.success && recordingRequest.data.type === "recording.stop") {
            return Promise.resolve(response).then(async (result) => {
                if (result.ok && result.session?.status === "stopped") {
                    try {
                        await syncQueue.enqueue(result.session);
                    } catch {
                        // Recording remains durable locally even if queue persistence fails.
                    }
                }
                return result;
            });
        }
        return response;
    });
    browser.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === SYNC_RETRY_ALARM) void syncQueue.flush();
    });
    browser.runtime.onStartup.addListener(() => void syncQueue.flush());
});
