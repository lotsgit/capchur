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
