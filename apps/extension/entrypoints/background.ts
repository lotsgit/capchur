import { createRecordingMessageHandler } from "../utils/recording-messages";
import { createRecordingStorage } from "../utils/recording-storage";

export default defineBackground(() => {
    const handleMessage = createRecordingMessageHandler(
        createRecordingStorage(browser.storage.local),
    );

    browser.runtime.onMessage.addListener((message, sender) =>
        handleMessage(message, sender.url ?? sender.tab?.url),
    );
});
