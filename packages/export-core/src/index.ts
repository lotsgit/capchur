import { GuideSchema, type Guide } from "@capchur/contracts";
import {
    AlignmentType,
    Document,
    ExternalHyperlink,
    HeadingLevel,
    ImageRun,
    Packer,
    Paragraph,
    TextRun,
} from "docx";
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

const DOCX_IMAGE_MAX_WIDTH = 624;
const DOCX_IMAGE_MAX_HEIGHT = 700;

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

function htmlTextWithLinks(value: string): string {
    const pattern = /https?:\/\/[^\s]+/g;
    let output = "";
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
        output += escapeHtml(value.slice(offset, match.index));
        const url = escapeHtml(match[0]);
        output += `<a href="${url}">${url}</a>`;
        offset = match.index + match[0].length;
    }
    return output + escapeHtml(value.slice(offset));
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

function fitImage(width: number, height: number): { width: number; height: number } {
    const scale = Math.min(1, DOCX_IMAGE_MAX_WIDTH / width, DOCX_IMAGE_MAX_HEIGHT / height);
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function linkedText(value: string): Array<TextRun | ExternalHyperlink> {
    const parts: Array<TextRun | ExternalHyperlink> = [];
    const pattern = /https?:\/\/[^\s]+/g;
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
        if (match.index > offset) parts.push(new TextRun(value.slice(offset, match.index)));
        parts.push(new ExternalHyperlink({
            link: match[0],
            children: [new TextRun({ text: match[0], style: "Hyperlink" })],
        }));
        offset = match.index + match[0].length;
    }
    if (offset < value.length) parts.push(new TextRun(value.slice(offset)));
    return parts;
}

export async function createDocxFile(input: Guide, resolveImage: ExportImageResolver): Promise<ExportFile> {
    const document = mapGuideToExportDocument(input);
    const children: Paragraph[] = [
        new Paragraph({ text: document.title, heading: HeadingLevel.TITLE }),
    ];
    if (document.branding.name) {
        children.push(new Paragraph({
            children: [new TextRun({ text: document.branding.name, bold: true, color: document.branding.accentColor.slice(1) })],
        }));
    }
    if (document.description) children.push(new Paragraph({ children: linkedText(document.description) }));
    if (document.introduction) children.push(new Paragraph({ children: linkedText(document.introduction) }));

    let activeSection: string | null = null;
    for (const step of document.steps) {
        if (step.section && step.section !== activeSection) {
            children.push(new Paragraph({
                text: step.section,
                heading: HeadingLevel.HEADING_1,
                keepNext: true,
            }));
        }
        activeSection = step.section;
        children.push(new Paragraph({
            text: `${step.number}. ${step.title}`,
            heading: HeadingLevel.HEADING_2,
            keepNext: true,
        }));
        if (step.description) children.push(new Paragraph({ children: linkedText(step.description) }));
        if (step.image) {
            const image = await renderImage(step, resolveImage);
            if (image) {
                children.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new ImageRun({
                        data: image,
                        type: "png",
                        transformation: fitImage(step.image.width, step.image.height),
                        altText: { title: step.title, description: step.image.alt, name: `Step ${step.number}` },
                    })],
                }));
            }
        }
    }

    const content = await Packer.toBuffer(new Document({
        creator: "Capchur",
        title: document.title,
        description: document.description,
        sections: [{
            properties: {
                page: {
                    margin: { top: 720, right: 720, bottom: 720, left: 720 },
                },
            },
            children,
        }],
    }));
    return {
        path: "guide.docx",
        content,
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
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
            ? `<figure><img src="${imagePath(step)}" alt="${escapeHtml(step.image.alt)}" width="${step.image.width}" height="${step.image.height}"><figcaption>${htmlTextWithLinks(step.description)}</figcaption></figure>`
            : step.description ? `<p>${htmlTextWithLinks(step.description)}</p>` : "";
        return `${section}<section aria-labelledby="step-${step.number}"><h3 id="step-${step.number}">${step.number}. ${escapeHtml(step.title)}</h3>${image}</section>`;
    }).join("");
    const brand = document.branding.name ? `<p class="brand">${escapeHtml(document.branding.name)}</p>` : "";
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title><style>:root{--accent:${document.branding.accentColor}}@page{size:Letter;margin:.6in}*{box-sizing:border-box}body{font:11pt/1.55 "Aptos","Segoe UI",sans-serif;max-width:960px;margin:auto;padding:2rem;color:#202421;overflow-wrap:anywhere}header{margin-bottom:2rem}h1,h2,h3{line-height:1.2;break-after:avoid}h1{font-size:25pt}h2{font-size:17pt;border-bottom:2px solid var(--accent);padding-bottom:.3rem}h3{font-size:13pt}section,figure{break-inside:avoid}img{display:block;max-width:100%;max-height:7.2in;width:auto;height:auto;object-fit:contain}figure{margin:1rem 0 2rem}figcaption{margin-top:.5rem}a{color:var(--accent);text-decoration:underline}.brand{color:var(--accent);font-weight:700}@media print{body{max-width:none;margin:0;padding:0}}</style></head><body><header>${brand}<h1>${escapeHtml(document.title)}</h1><p>${htmlTextWithLinks(document.description)}</p></header><main>${document.introduction ? `<p>${htmlTextWithLinks(document.introduction)}</p>` : ""}${steps}</main></body></html>`;

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