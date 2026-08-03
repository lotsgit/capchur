import { installClickCapture } from "../utils/click-capture";

export default defineContentScript({
    matches: ["http://*/*", "https://*/*"],
    main() {
        installClickCapture(window, (message) => browser.runtime.sendMessage(message));
    },
});
