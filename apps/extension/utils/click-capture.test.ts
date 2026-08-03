// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClickCaptureMessage, installClickCapture } from "./click-capture";

const visibleRect = {
    x: 20,
    y: 30,
    width: 120,
    height: 40,
    top: 30,
    right: 140,
    bottom: 70,
    left: 20,
    toJSON: () => ({}),
};

beforeEach(() => {
    document.body.replaceChildren();
    document.title = "Settings";
    window.history.replaceState({}, "", "/settings");
});

describe("content click capture", () => {
    it("uses the composed path to create schema-validated element metadata", () => {
        const button = document.createElement("button");
        button.id = "save";
        button.textContent = "Save";
        const icon = document.createElement("span");
        button.append(icon);
        document.body.append(button);
        vi.spyOn(icon, "getBoundingClientRect").mockReturnValue(visibleRect);

        const event = new Event("click");
        vi.spyOn(event, "composedPath").mockReturnValue([icon, button, document, window]);
        const message = createClickCaptureMessage(event, window);

        expect(message).toMatchObject({
            type: "capture.click",
            capture: {
                url: "http://localhost:3000/settings",
                pageTitle: "Settings",
                description: "Click the Save button",
                element: { tagName: "button", selectors: ["#save"] },
                highlight: { rect: { x: 20, y: 30, width: 120, height: 40 } },
            },
        });
        expect(message && "capture" in message ? message.capture.element : {}).not.toHaveProperty("value");
    });

    it("ignores hidden and extension-owned targets", () => {
        const hiddenButton = document.createElement("button");
        hiddenButton.hidden = true;
        hiddenButton.textContent = "Hidden";
        vi.spyOn(hiddenButton, "getBoundingClientRect").mockReturnValue(visibleRect);

        const extensionButton = document.createElement("button");
        extensionButton.dataset.capchurUi = "true";
        extensionButton.textContent = "Capchur";
        vi.spyOn(extensionButton, "getBoundingClientRect").mockReturnValue(visibleRect);

        for (const target of [hiddenButton, extensionButton]) {
            const event = new Event("click");
            vi.spyOn(event, "composedPath").mockReturnValue([target, document, window]);
            expect(createClickCaptureMessage(event, window)).toBeNull();
        }
    });

    it("registers one capture-phase listener when installed repeatedly", async () => {
        const button = document.createElement("button");
        button.textContent = "Save";
        document.body.append(button);
        vi.spyOn(button, "getBoundingClientRect").mockReturnValue(visibleRect);
        const sendMessage = vi.fn().mockResolvedValue(undefined);

        installClickCapture(window, sendMessage);
        installClickCapture(window, sendMessage);
        button.click();
        await Promise.resolve();

        expect(sendMessage).toHaveBeenCalledTimes(1);
    });
});