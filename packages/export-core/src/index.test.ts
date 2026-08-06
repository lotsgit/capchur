import type { Guide } from "@capchur/contracts";
import JSZip from "jszip";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createDocxFile, createHtmlBundle, createMarkdownBundle, createPrintHtmlBundle, mapGuideToExportDocument } from "./index";

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

        expect(document).toMatchObject({
            updatedAt: 1,
            stepCount: 2,
            sections: ["Prepare", "Finish"],
        });
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
    it("creates a valid DOCX package from ordered, flattened guide content", async () => {
        const file = await createDocxFile(guide, sourceImage);
        const bytes = file.content as Uint8Array;
        const archive = await JSZip.loadAsync(bytes);
        const documentXml = await archive.file("word/document.xml")!.async("string");
        const stylesXml = await archive.file("word/styles.xml")!.async("string");
        const settingsXml = await archive.file("word/settings.xml")!.async("string");
        const headerXml = await Promise.all(
            archive.file(/^word\/header\d+\.xml$/).map((entry) => entry.async("string")),
        );
        const footerXml = await Promise.all(
            archive.file(/^word\/footer\d+\.xml$/).map((entry) => entry.async("string")),
        );

        expect(file.path).toBe("guide.docx");
        expect(file.mediaType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
        expect(bytes.byteLength).toBeGreaterThan(5_000);
        expect(stylesXml).toContain('w:styleId="CoverBrand"');
        expect(stylesXml).toContain('w:styleId="StepDescription"');
        expect(stylesXml).toContain('w:styleId="Caption"');
        expect(documentXml).toContain('<w:pgSz w:w="11906" w:h="16838"');
        expect(documentXml).toContain("<w:titlePg/>");
        expect(documentXml).toContain('w:name="step-1"');
        expect(documentXml).toContain('w:anchor="step-1"');
        expect(documentXml).toContain("<w:cantSplit/>");
        expect(documentXml).toContain("Step 1: Click [Save]");
        expect(settingsXml).toContain("<w:updateFields");
        expect(headerXml.join("\n")).toContain("Example [Team]");
        expect(footerXml.join("\n")).toContain("PAGE");
        expect(footerXml.join("\n")).toContain("NUMPAGES");
    });

    it("escapes HTML and references accessible local images in guide order", async () => {
        const bundle = await createHtmlBundle({
            ...guide,
            introduction: "Read https://example.com/runbook first",
        }, sourceImage);
        const html = bundle.files[0].content;

        if (typeof html !== "string") throw new Error("Expected an HTML text entrypoint");
        expect(html).toContain("Deploy &lt;safely&gt;");
        expect(html).toContain("Use A &amp; B");
        expect(html).not.toContain("<release>");
        expect(html).toContain('alt="Save [button]"');
        expect(html).toContain('<a href="https://example.com/runbook">https://example.com/runbook</a>');
        expect(html).toContain('@page{size:Letter');
        expect(html).toContain('break-inside:avoid');
        expect(html).toContain('max-height:7.2in');
        expect(html).toContain('"Aptos","Segoe UI",sans-serif');
        expect(html.indexOf("Click [Save]")).toBeLessThan(html.indexOf("Second"));
        expect(bundle.files.map(({ path }) => path)).toEqual(["index.html", "assets/step-1.png"]);
    });

    it("creates a professional A4 print bundle without changing portable HTML", async () => {
        const brandedGuide = {
            ...guide,
            branding: { ...guide.branding, logoUrl: "/private/logo.png" },
        };
        const bundle = await createPrintHtmlBundle(brandedGuide, sourceImage);
        const html = bundle.files[0].content;

        if (typeof html !== "string") throw new Error("Expected a print HTML entrypoint");
        expect(bundle.entrypoint).toBe("print.html");
        expect(html).toContain("@page{size:A4");
        expect(html).toContain('class="cover"');
        expect(html).toContain('class="contents"');
        expect(html).toContain('href="#step-1"');
        expect(html).toContain('id="section-1"');
        expect(html).toContain('class="step__number">1');
        expect(html).toContain("January 1, 1970");
        expect(html).toContain("2</strong> steps");
        expect(html).toContain('class="cover__logo"');
        expect(bundle.files.map(({ path }) => path)).toEqual(["print.html", "assets/brand-logo.png", "assets/step-1.png"]);

        const portable = await createHtmlBundle(guide, sourceImage);
        expect(portable.entrypoint).toBe("index.html");
        expect(portable.files[0].content).not.toContain('class="cover"');
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