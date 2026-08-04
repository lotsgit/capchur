import { GuideSchema, type Guide } from "@capchur/contracts";
import sharp, { type OverlayOptions } from "sharp";

type ImageRect = { x: number; y: number; width: number; height: number };

export interface ExportDocumentStep {
    id: string;
    number: number;
    title: string;
    description: string;
    section: string | null;
    image: {
        source: string;
        alt: string;
        width: number;
        height: number;
        crop: ImageRect;
        highlight: ImageRect | null;
        redactions: ImageRect[];
    } | null;
}

export interface ExportDocument {
    title: string;
    description: string;
    introduction: string;
    branding: Guide["branding"];
    steps: ExportDocumentStep[];
}

export interface ExportFile {
    path: string;
    content: string | Uint8Array;
    mediaType: string;
}

export interface ExportBundle {
    entrypoint: string;
    files: ExportFile[];
}

export type ExportImageResolver = (source: string) => Promise<Uint8Array>;

function intersect(rect: ImageRect, bounds: ImageRect): ImageRect | null {
    const x = Math.max(rect.x, bounds.x);
    const y = Math.max(rect.y, bounds.y);
    const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
    const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);
    return right > x && bottom > y
        ? { x: x - bounds.x, y: y - bounds.y, width: right - x, height: bottom - y }
        : null;
}

export function mapGuideToExportDocument(input: Guide): ExportDocument {
    const guide = GuideSchema.parse(input);

    return {
        title: guide.title,
        description: guide.description,
        introduction: guide.introduction,
        branding: guide.branding,
        steps: [...guide.steps]
            .sort((left, right) => left.position - right.position)
            .map((step, index) => {
                const crop = step.annotation?.crop ?? {
                    x: 0,
                    y: 0,
                    width: step.media?.width ?? 0,
                    height: step.media?.height ?? 0,
                };
                const highlight = step.annotation && !step.annotation.hidden
                    ? intersect(step.annotation.rect, crop)
                    : null;

                return {
                    id: step.id,
                    number: index + 1,
                    title: step.title,
                    description: step.description,
                    section: step.section,
                    image: step.media ? {
                        source: step.media.source,
                        alt: step.media.alt || step.description || step.title,
                        width: crop.width,
                        height: crop.height,
                        crop,
                        highlight,
                        redactions: (step.annotation?.redactions ?? [])
                            .map(({ rect }) => intersect(rect, crop))
                            .filter((rect): rect is ImageRect => rect !== null),
                    } : null,
                };
            }),
    };
}

function svgOverlay(rect: ImageRect, fill: string, stroke = "none", strokeWidth = 0): Buffer {
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`);
}

async function renderImage(step: ExportDocumentStep, resolveImage: ExportImageResolver): Promise<Uint8Array | null> {
    if (!step.image) return null;

    const { crop, highlight, redactions } = step.image;
    const overlays: OverlayOptions[] = [];
    if (highlight) {
        overlays.push({
            input: svgOverlay(highlight, "none", "#e23d28", 4),
            left: Math.floor(highlight.x),
            top: Math.floor(highlight.y),
        });
    }
    overlays.push(...redactions.map((rect) => ({
        input: svgOverlay(rect, "#000000"),
        left: Math.floor(rect.x),
        top: Math.floor(rect.y),
    })));

    return sharp(await resolveImage(step.image.source))
        .extract({
            left: Math.floor(crop.x),
            top: Math.floor(crop.y),
            width: Math.ceil(crop.width),
            height: Math.ceil(crop.height),
        })
        .composite(overlays)
        .png()
        .toBuffer();
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
    })[character]!);
}

function escapeMarkdown(value: string): string {
    return value.replace(/([\\`*_[\]<>#])/g, "\\$1");
}

function imagePath(step: ExportDocumentStep): string {
    return `assets/step-${step.number}.png`;
}

async function imageFiles(document: ExportDocument, resolveImage: ExportImageResolver): Promise<ExportFile[]> {
    const files: ExportFile[] = [];
    for (const step of document.steps) {
        const content = await renderImage(step, resolveImage);
        if (content) files.push({ path: imagePath(step), content, mediaType: "image/png" });
    }
    return files;
}

export async function createHtmlBundle(input: Guide, resolveImage: ExportImageResolver): Promise<ExportBundle> {
    const document = mapGuideToExportDocument(input);
    let activeSection: string | null = null;
    const steps = document.steps.map((step) => {
        const section = step.section && step.section !== activeSection
            ? `<h2>${escapeHtml(step.section)}</h2>`
            : "";
        activeSection = step.section;
        const image = step.image
            ? `<figure><img src="${imagePath(step)}" alt="${escapeHtml(step.image.alt)}" width="${step.image.width}" height="${step.image.height}"><figcaption>${escapeHtml(step.description)}</figcaption></figure>`
            : step.description ? `<p>${escapeHtml(step.description)}</p>` : "";
        return `${section}<section aria-labelledby="step-${step.number}"><h3 id="step-${step.number}">${step.number}. ${escapeHtml(step.title)}</h3>${image}</section>`;
    }).join("");
    const brand = document.branding.name ? `<p class="brand">${escapeHtml(document.branding.name)}</p>` : "";
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title><style>:root{--accent:${document.branding.accentColor}}body{font:16px/1.6 sans-serif;max-width:960px;margin:auto;padding:2rem;color:#202421}h1,h2,h3{line-height:1.2}h2{border-bottom:2px solid var(--accent);padding-bottom:.3rem}img{max-width:100%;height:auto}figure{margin:1rem 0 2.5rem}figcaption{margin-top:.5rem}.brand{color:var(--accent);font-weight:700}</style></head><body><header>${brand}<h1>${escapeHtml(document.title)}</h1><p>${escapeHtml(document.description)}</p></header><main>${document.introduction ? `<p>${escapeHtml(document.introduction)}</p>` : ""}${steps}</main></body></html>`;

    return { entrypoint: "index.html", files: [{ path: "index.html", content: html, mediaType: "text/html" }, ...await imageFiles(document, resolveImage)] };
}

export async function createMarkdownBundle(input: Guide, resolveImage: ExportImageResolver): Promise<ExportBundle> {
    const document = mapGuideToExportDocument(input);
    const lines = [`# ${escapeMarkdown(document.title)}`, ""];
    if (document.branding.name) lines.push(`**${escapeMarkdown(document.branding.name)}**`, "");
    if (document.description) lines.push(escapeMarkdown(document.description), "");
    if (document.introduction) lines.push(escapeMarkdown(document.introduction), "");
    let activeSection: string | null = null;
    for (const step of document.steps) {
        if (step.section && step.section !== activeSection) lines.push(`## ${escapeMarkdown(step.section)}`, "");
        activeSection = step.section;
        lines.push(`### ${step.number}. ${escapeMarkdown(step.title)}`, "");
        if (step.description) lines.push(escapeMarkdown(step.description), "");
        if (step.image) lines.push(`![${escapeMarkdown(step.image.alt)}](${imagePath(step)})`, "");
    }

    return { entrypoint: "guide.md", files: [{ path: "guide.md", content: `${lines.join("\n").trimEnd()}\n`, mediaType: "text/markdown" }, ...await imageFiles(document, resolveImage)] };
}