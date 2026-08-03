import { createRecordingMessageHandler } from "../utils/recording-messages";
import { createRecordingStorage } from "../utils/recording-storage";
import { createScreenshotCapture } from "../utils/screenshot-capture";
import { createScreenshotStorage } from "../utils/screenshot-storage";

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

    browser.runtime.onMessage.addListener((message, sender) =>
        handleMessage(message, {
            url: sender.url ?? sender.tab?.url,
            tabId: sender.tab?.id,
            windowId: sender.tab?.windowId,
        }),
    );
});
