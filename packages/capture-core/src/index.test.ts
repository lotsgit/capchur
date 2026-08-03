// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";

import {
    analyzeElement,
    getElementName,
    getLocatorCandidates,
} from "./index";

beforeEach(() => {
    document.body.replaceChildren();
});

describe("element naming and descriptions", () => {
    it("describes native controls using the documented name priority", () => {
        document.body.innerHTML = `
            <span id="aria-name">Account settings</span>
            <label for="save">Ignored label</label>
            <button id="save" aria-labelledby="aria-name" aria-label="Ignored ARIA label" title="Ignored title">
                Ignored text
            </button>
        `;

        const result = analyzeElement(document.querySelector("button")!);

        expect(result).toEqual({
            supported: true,
            description: "Click the Account settings button",
            metadata: {
                tagName: "button",
                accessibleName: "Account settings",
                role: "button",
                selectors: expect.arrayContaining(["#save"]),
            },
        });
    });

    it.each([
        ["label", '<label for="target">Email address</label><input id="target">', "Email address"],
        ["text", '<button id="target">Save</button>', "Save"],
        ["alternative text", '<img id="target" alt="Profile photo">', "Profile photo"],
        ["title", '<div id="target" title="Open settings"></div>', "Open settings"],
        ["placeholder", '<input id="target" placeholder="Search guides">', "Search guides"],
        ["nearby context", '<h2>Billing details</h2><div id="target"></div>', "Billing details"],
    ])("uses %s as a safe fallback", (_source, fixture, expected) => {
        document.body.innerHTML = fixture;
        expect(getElementName(document.querySelector("#target")!)).toBe(expected);
    });

    it("resolves a nested event target to its actionable control", () => {
        document.body.innerHTML = '<button id="save"><span><strong>Save</strong></span></button>';

        const result = analyzeElement(document.querySelector("strong")!);

        expect(result.supported).toBe(true);
        if (result.supported) {
            expect(result.description).toBe("Click the Save button");
            expect(result.metadata.tagName).toBe("button");
        }
    });

    it("supports ARIA controls and unlabeled controls", () => {
        document.body.innerHTML = `
            <div id="menu" role="button" aria-label="Open menu"></div>
            <button id="unlabeled"></button>
        `;

        expect(analyzeElement(document.querySelector("#menu")!)).toMatchObject({
            supported: true,
            description: "Click the Open menu button",
        });
        expect(analyzeElement(document.querySelector("#unlabeled")!)).toMatchObject({
            supported: true,
            description: "Click the button",
        });
    });
});

describe("locator candidates", () => {
    it("generates several deterministic candidates without putting them in descriptions", () => {
        document.body.innerHTML = '<button id="save" data-testid="save-action" aria-label="Save">Save</button>';

        const element = document.querySelector("button")!;
        const selectors = getLocatorCandidates(element);
        const result = analyzeElement(element);

        expect(selectors).toEqual(expect.arrayContaining([
            "#save",
            'button[data-testid="save-action"]',
            'button[aria-label="Save"]',
        ]));
        expect(result.supported && result.description).toBe("Click the Save button");
        expect(result.supported && result.description).not.toContain("#save");
    });

    it("includes deterministic shadow DOM boundaries", () => {
        const host = document.createElement("div");
        host.id = "toolbar";
        document.body.append(host);
        const shadowRoot = host.attachShadow({ mode: "open" });
        shadowRoot.innerHTML = '<button id="save">Save</button>';

        expect(getLocatorCandidates(shadowRoot.querySelector("button")!)).toContain(
            "#toolbar >>> #save",
        );
    });
});

describe("privacy and support checks", () => {
    it.each([
        ['<input id="account-password" type="password" value="do-not-capture">', "sensitive"],
        ['<input autocomplete="cc-number" value="4111111111111111">', "sensitive"],
        ["<canvas></canvas>", "unsupported"],
        ['<input type="hidden" value="private">', "unsupported"],
    ] as const)("rejects unsafe fixture %# without metadata", (fixture, reason) => {
        document.body.innerHTML = fixture;

        const result = analyzeElement(document.body.firstElementChild!);

        expect(result).toEqual({ supported: false, reason });
        expect(JSON.stringify(result)).not.toContain("do-not-capture");
        expect(JSON.stringify(result)).not.toContain("4111111111111111");
    });
});