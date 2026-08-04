import type { Guide } from "@capchur/contracts";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createHtmlBundle, createMarkdownBundle, mapGuideToExportDocument } from "./index";

const guide: Guide = {
    version: 1,
    id: "0198f1d0-c184-7000-8000-000000000001",
    title: "Deploy <safely>",
    description: "Use A & B",
    introduction: "Read # first",
    branding: { name: "Example [Team]", accentColor: "#164c3b", logoUrl: null },
    updatedAt: 1,
    steps: [{
        id: "0198f1d0-c184-7000-8000-000000000002",
        position: 2,
        title: "Second",
        description: "No image",
        section: "Finish",
        media: null,
        annotation: null,
    }, {
        id: "0198f1d0-c184-7000-8000-000000000003",
        position: 0,
        title: "Click [Save]",
        description: "Confirm <release>",
        section: "Prepare",
        media: { type: "image", source: "/private/source.png", width: 8, height: 8, alt: "Save [button]" },
        annotation: {
            rect: { x: 3, y: 3, width: 3, height: 3 },
            coordinateSpace: "image-pixels",
            hidden: false,
            crop: { x: 2, y: 2, width: 5, height: 5 },
            redactions: [{ id: "0198f1d0-c184-7000-8000-000000000004", rect: { x: 4, y: 4, width: 2, height: 2 } }],
        },
    }],
};

async function sourceImage(): Promise<Uint8Array> {
    return sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
}

describe("export document mapping", () => {
    it("sorts steps and translates annotations into cropped image coordinates", () => {
        const document = mapGuideToExportDocument(guide);

        expect(document.steps.map(({ title }) => title)).toEqual(["Click [Save]", "Second"]);
        expect(document.steps[0].image).toMatchObject({
            width: 5,
            height: 5,
            highlight: { x: 1, y: 1, width: 3, height: 3 },
            redactions: [{ x: 2, y: 2, width: 2, height: 2 }],
        });
    });
});

describe("portable bundles", () => {
    it("escapes HTML and references accessible local images in guide order", async () => {
        const bundle = await createHtmlBundle(guide, sourceImage);
        const html = bundle.files[0].content;

        if (typeof html !== "string") throw new Error("Expected an HTML text entrypoint");
        expect(html).toContain("Deploy &lt;safely&gt;");
        expect(html).toContain("Use A &amp; B");
        expect(html).not.toContain("<release>");
        expect(html).toContain('alt="Save [button]"');
        expect(html.indexOf("Click [Save]")).toBeLessThan(html.indexOf("Second"));
        expect(bundle.files.map(({ path }) => path)).toEqual(["index.html", "assets/step-1.png"]);
    });

    it("escapes Markdown and flattens crop, highlights, and redactions into PNG pixels", async () => {
        const bundle = await createMarkdownBundle(guide, sourceImage);
        const markdown = bundle.files[0].content;
        const png = bundle.files[1].content as Uint8Array;
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });

        if (typeof markdown !== "string") throw new Error("Expected a Markdown text entrypoint");
        expect(markdown).toContain("# Deploy \\<safely\\>");
        expect(markdown).toContain("### 1. Click \\[Save\\]");
        expect(markdown).toContain("![Save \\[button\\]](assets/step-1.png)");
        expect(markdown.indexOf("Click")).toBeLessThan(markdown.indexOf("Second"));
        expect(info).toMatchObject({ width: 5, height: 5 });
        const highlightedPixel = info.width * info.channels + info.channels;
        expect(data[highlightedPixel]).toBeGreaterThan(data[highlightedPixel + 1]);
        const redactedPixel = 2 * info.width * info.channels + 2 * info.channels;
        expect([...data.subarray(redactedPixel, redactedPixel + 3)]).toEqual([0, 0, 0]);
    });
});