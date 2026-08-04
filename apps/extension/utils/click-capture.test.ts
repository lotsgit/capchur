// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    createActionCaptureMessage,
    createClickCaptureMessage,
    installClickCapture,
} from "./click-capture";

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

    it("captures committed input, select, and submit actions without field values", async () => {
        document.body.innerHTML = `
            <label for="name">Display name</label><input id="name" value="Private value">
            <label for="team">Team</label><select id="team"><option selected>Secret option</option></select>
            <form aria-label="Profile"><button type="submit">Save</button></form>
        `;
        const input = document.querySelector("input")!;
        const select = document.querySelector("select")!;
        const form = document.querySelector("form")!;
        for (const element of [input, select, form]) {
            vi.spyOn(element, "getBoundingClientRect").mockReturnValue(visibleRect);
        }
        const sendMessage = vi.fn().mockResolvedValue(undefined);
        installClickCapture(window, sendMessage);

        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        form.dispatchEvent(new Event("submit", { bubbles: true, composed: true }));
        await Promise.resolve();

        expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
            "capture.input",
            "capture.select",
            "capture.submit",
        ]);
        expect(JSON.stringify(sendMessage.mock.calls)).not.toContain("Private value");
        expect(JSON.stringify(sendMessage.mock.calls)).not.toContain("Secret option");
    });

    it("uses the current SPA URL and captures controls added after installation", async () => {
        const sendMessage = vi.fn().mockResolvedValue(undefined);
        installClickCapture(window, sendMessage);
        window.history.pushState({}, "", "/settings/profile");
        const button = document.createElement("button");
        button.textContent = "Save profile";
        document.body.append(button);
        vi.spyOn(button, "getBoundingClientRect").mockReturnValue(visibleRect);

        button.click();
        await Promise.resolve();

        expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            capture: expect.objectContaining({
                url: "http://localhost:3000/settings/profile",
            }),
        }));
    });

    it("rejects sensitive inputs and unsupported canvas targets", () => {
        document.body.innerHTML = `
            <input type="password" value="do-not-capture">
            <canvas></canvas>
        `;
        for (const element of Array.from(document.body.children)) {
            vi.spyOn(element, "getBoundingClientRect").mockReturnValue(visibleRect);
            const event = new Event("change");
            vi.spyOn(event, "composedPath").mockReturnValue([element, document, window]);
            expect(createActionCaptureMessage(event, window, "input")).toBeNull();
        }
    });
});