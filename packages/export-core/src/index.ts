import { GuideSchema, type Guide } from "@capchur/contracts";
import {
    AlignmentType,
    Bookmark,
    BorderStyle,
    Document,
    ExternalHyperlink,
    FileChild,
    Footer,
    Header,
    HeadingLevel,
    ImageRun,
    InternalHyperlink,
    PageBreak,
    PageNumber,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
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
    updatedAt: number;
    stepCount: number;
    sections: string[];
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

const DOCX_IMAGE_MAX_WIDTH = 640;
const DOCX_IMAGE_MAX_HEIGHT = 720;
const A4_PAGE_WIDTH = 11_906;
const A4_PAGE_HEIGHT = 16_838;
const A4_HORIZONTAL_MARGIN = 1_020;
const A4_VERTICAL_MARGIN = 1_134;

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
    const steps = [...guide.steps].sort((left, right) => left.position - right.position);

    return {
        title: guide.title,
        description: guide.description,
        introduction: guide.introduction,
        updatedAt: guide.updatedAt,
        stepCount: steps.length,
        sections: [...new Set(steps.flatMap(({ section }) => section ? [section] : []))],
        branding: guide.branding,
        steps: steps
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

const BRAND_LOGO_PATH = "assets/brand-logo.png";

async function imageFiles(document: ExportDocument, resolveImage: ExportImageResolver): Promise<ExportFile[]> {
    const files: ExportFile[] = [];
    for (const step of document.steps) {
        const content = await renderImage(step, resolveImage);
        if (content) files.push({ path: imagePath(step), content, mediaType: "image/png" });
    }
    return files;
}

async function brandingFile(document: ExportDocument, resolveImage: ExportImageResolver): Promise<ExportFile | null> {
    if (!document.branding.logoUrl) return null;
    try {
        const content = await sharp(await resolveImage(document.branding.logoUrl))
            .resize({ width: 480, height: 160, fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();
        return { path: BRAND_LOGO_PATH, content, mediaType: "image/png" };
    } catch {
        return null;
    }
}

function formatExportDate(timestamp: number): string {
    return new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    }).format(timestamp);
}

function fitImage(width: number, height: number): { width: number; height: number } {
    const scale = Math.min(1, DOCX_IMAGE_MAX_WIDTH / width, DOCX_IMAGE_MAX_HEIGHT / height);
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function fitWithin(width: number, height: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
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
    const accent = document.branding.accentColor.slice(1).toUpperCase();
    const brandName = document.branding.name || "Capchur";
    const branding = await brandingFile(document, resolveImage);
    const children: FileChild[] = [];
    if (branding && typeof branding.content !== "string") {
        const metadata = await sharp(branding.content).metadata();
        const transformation = fitWithin(metadata.width ?? 1, metadata.height ?? 1, 240, 80);
        children.push(new Paragraph({
            spacing: { after: 360 },
            children: [new ImageRun({
                data: branding.content,
                type: "png",
                transformation,
                altText: { title: brandName, description: `${brandName} logo`, name: "Guide logo" },
            })],
        }));
    }
    children.push(
        new Paragraph({
            style: "CoverBrand",
            children: [new TextRun({ text: brandName.toUpperCase(), bold: true, color: accent })],
        }),
        new Paragraph({ text: document.title, heading: HeadingLevel.TITLE }),
    );
    if (document.description) {
        children.push(new Paragraph({
            style: "Subtitle",
            children: linkedText(document.description),
        }));
    }
    children.push(new Paragraph({
        style: "Metadata",
        children: [new TextRun(`Updated ${formatExportDate(document.updatedAt)}  |  ${document.stepCount} ${document.stepCount === 1 ? "step" : "steps"}  |  ${document.sections.length} ${document.sections.length === 1 ? "section" : "sections"}`)],
    }));
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ text: "Contents", heading: HeadingLevel.HEADING_1 }));
    for (const step of document.steps) {
        children.push(new Paragraph({
            style: "ContentsEntry",
            children: [new InternalHyperlink({
                anchor: `step-${step.number}`,
                children: [new TextRun({ text: `${step.number}. ${step.title}`, color: accent })],
            })],
        }));
    }
    if (document.introduction) {
        children.push(new Paragraph({
            style: "Introduction",
            children: linkedText(document.introduction),
        }));
    }

    let activeSection: string | null = null;
    for (const step of document.steps) {
        if (step.section && step.section !== activeSection) {
            children.push(new Paragraph({
                text: step.section,
                heading: HeadingLevel.HEADING_1,
                keepNext: true,
                pageBreakBefore: activeSection !== null,
            }));
        }
        activeSection = step.section;
        const titleBookmark = new Bookmark({
            id: `step-${step.number}`,
            children: [new TextRun({ text: step.title, bold: true, color: "202421" })],
        });
        children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
                top: { style: BorderStyle.SINGLE, color: "D9DFDB", size: 4 },
                bottom: { style: BorderStyle.SINGLE, color: "D9DFDB", size: 4 },
                left: { style: BorderStyle.SINGLE, color: "D9DFDB", size: 4 },
                right: { style: BorderStyle.SINGLE, color: "D9DFDB", size: 4 },
                insideVertical: { style: BorderStyle.NONE, color: "FFFFFF", size: 0 },
                insideHorizontal: { style: BorderStyle.NONE, color: "FFFFFF", size: 0 },
            },
            rows: [new TableRow({
                cantSplit: true,
                children: [
                    new TableCell({
                        width: { size: 900, type: WidthType.DXA },
                        shading: { fill: accent, type: ShadingType.CLEAR },
                        verticalAlign: VerticalAlign.CENTER,
                        margins: { top: 120, bottom: 120, left: 120, right: 120 },
                        children: [new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: String(step.number), bold: true, color: "FFFFFF", size: 24 })],
                        })],
                    }),
                    new TableCell({
                        shading: { fill: "F4F7F5", type: ShadingType.CLEAR },
                        verticalAlign: VerticalAlign.CENTER,
                        margins: { top: 120, bottom: 120, left: 180, right: 180 },
                        children: [new Paragraph({
                            heading: HeadingLevel.HEADING_2,
                            keepNext: true,
                            children: [titleBookmark.start, ...titleBookmark.children, titleBookmark.end],
                        })],
                    }),
                ],
            })],
        }));
        if (step.description) children.push(new Paragraph({
            style: "StepDescription",
            keepNext: true,
            keepLines: true,
            children: linkedText(step.description),
        }));
        if (step.image) {
            const image = await renderImage(step, resolveImage);
            if (image) {
                children.push(new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: {
                        top: { style: BorderStyle.SINGLE, color: "D9DFDB", size: 4 },
                        bottom: { style: BorderStyle.SINGLE, color: "D9DFDB", size: 4 },
                        left: { style: BorderStyle.SINGLE, color: "D9DFDB", size: 4 },
                        right: { style: BorderStyle.SINGLE, color: "D9DFDB", size: 4 },
                        insideVertical: { style: BorderStyle.NONE, color: "FFFFFF", size: 0 },
                        insideHorizontal: { style: BorderStyle.NONE, color: "FFFFFF", size: 0 },
                    },
                    rows: [new TableRow({
                        cantSplit: true,
                        children: [new TableCell({
                            shading: { fill: "F4F7F5", type: ShadingType.CLEAR },
                            margins: { top: 180, bottom: 120, left: 180, right: 180 },
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    keepNext: true,
                                    children: [new ImageRun({
                                        data: image,
                                        type: "png",
                                        transformation: fitImage(step.image.width, step.image.height),
                                        altText: { title: step.title, description: step.image.alt, name: `Step ${step.number}` },
                                    })],
                                }),
                                new Paragraph({
                                    style: "Caption",
                                    alignment: AlignmentType.CENTER,
                                    children: [new TextRun(`Step ${step.number}: ${step.title}`)],
                                }),
                            ],
                        })],
                    })],
                }));
            }
        }
        children.push(new Paragraph({ style: "StepSpacer", text: "" }));
    }

    const content = await Packer.toBuffer(new Document({
        creator: "Capchur",
        title: document.title,
        description: document.description,
        features: { updateFields: true },
        styles: {
            default: {
                document: {
                    run: { font: "Aptos", size: 21, color: "202421" },
                    paragraph: { spacing: { after: 160, line: 300 } },
                },
                title: {
                    run: { font: "Aptos Display", size: 60, bold: true, color: "202421" },
                    paragraph: { spacing: { before: 1_800, after: 360 }, keepNext: true },
                },
                heading1: {
                    run: { font: "Aptos Display", size: 36, bold: true, color: accent },
                    paragraph: { spacing: { before: 320, after: 240 }, keepNext: true, outlineLevel: 0 },
                },
                heading2: {
                    run: { font: "Aptos Display", size: 28, bold: true, color: "202421" },
                    paragraph: { spacing: { before: 0, after: 0 }, keepNext: true, outlineLevel: 1 },
                },
                hyperlink: { run: { color: accent, underline: { color: accent } } },
            },
            paragraphStyles: [
                { id: "CoverBrand", name: "Cover Brand", run: { font: "Aptos", size: 20, bold: true }, paragraph: { spacing: { before: 900, after: 320 } } },
                { id: "Subtitle", name: "Subtitle", run: { font: "Aptos", size: 28, color: "66706A" }, paragraph: { spacing: { after: 600 }, keepLines: true } },
                { id: "Metadata", name: "Metadata", run: { font: "Aptos", size: 18, color: "66706A" }, paragraph: { spacing: { before: 280, after: 120 } } },
                { id: "ContentsEntry", name: "Contents Entry", run: { font: "Aptos", size: 21 }, paragraph: { spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, color: "D9DFDB", size: 2 } } } },
                { id: "Introduction", name: "Introduction", run: { font: "Aptos", size: 22, color: "414944" }, paragraph: { spacing: { before: 280, after: 360 }, border: { left: { style: BorderStyle.SINGLE, color: accent, size: 16, space: 10 } }, shading: { fill: "F4F7F5", type: ShadingType.CLEAR } } },
                { id: "StepDescription", name: "Step Description", run: { font: "Aptos", size: 21, color: "414944" }, paragraph: { spacing: { before: 160, after: 180 }, indent: { left: 360 } } },
                { id: "Caption", name: "Caption", run: { font: "Aptos", size: 17, italics: true, color: "66706A" }, paragraph: { spacing: { before: 100, after: 0 } } },
                { id: "StepSpacer", name: "Step Spacer", run: { size: 6 }, paragraph: { spacing: { before: 0, after: 220 } } },
                { id: "Header", name: "Header", run: { font: "Aptos", size: 16, color: "66706A" }, paragraph: { border: { bottom: { style: BorderStyle.SINGLE, color: "D9DFDB", size: 2, space: 4 } } } },
                { id: "Footer", name: "Footer", run: { font: "Aptos", size: 16, color: "66706A" }, paragraph: { alignment: AlignmentType.RIGHT } },
            ],
        },
        sections: [{
            properties: {
                titlePage: true,
                page: {
                    size: { width: A4_PAGE_WIDTH, height: A4_PAGE_HEIGHT },
                    margin: {
                        top: A4_VERTICAL_MARGIN,
                        right: A4_HORIZONTAL_MARGIN,
                        bottom: A4_VERTICAL_MARGIN,
                        left: A4_HORIZONTAL_MARGIN,
                        header: 540,
                        footer: 540,
                    },
                },
            },
            headers: {
                first: new Header({ children: [new Paragraph("")] }),
                default: new Header({ children: [new Paragraph({
                    style: "Header",
                    children: [new TextRun({ text: brandName, bold: true, color: accent }), new TextRun(`  |  ${document.title}`)],
                })] }),
            },
            footers: {
                first: new Footer({ children: [new Paragraph("")] }),
                default: new Footer({ children: [new Paragraph({
                    style: "Footer",
                    children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES] })],
                })] }),
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

export async function createPrintHtmlBundle(input: Guide, resolveImage: ExportImageResolver): Promise<ExportBundle> {
    const document = mapGuideToExportDocument(input);
    const brandName = document.branding.name || "Capchur";
    const branding = await brandingFile(document, resolveImage);
    const logo = branding
        ? `<img class="cover__logo" src="${BRAND_LOGO_PATH}" alt="${escapeHtml(brandName)}">`
        : `<div class="cover__mark" aria-hidden="true">C</div>`;
    const contents = document.steps.map((step) => (
        `<li><a href="#step-${step.number}"><span>${step.number}. ${escapeHtml(step.title)}</span><span class="toc__section">${escapeHtml(step.section ?? "")}</span></a></li>`
    )).join("");

    let activeSection: string | null = null;
    let sectionIndex = 0;
    const steps = document.steps.map((step) => {
        let section = "";
        if (step.section && step.section !== activeSection) {
            sectionIndex += 1;
            section = `<header class="section-heading" id="section-${sectionIndex}"><span>Section ${sectionIndex}</span><h2>${escapeHtml(step.section)}</h2></header>`;
        }
        activeSection = step.section;
        const description = step.description
            ? `<p class="step__description">${htmlTextWithLinks(step.description)}</p>`
            : "";
        const figure = step.image
            ? `<figure><div class="screenshot"><img src="${imagePath(step)}" alt="${escapeHtml(step.image.alt)}" width="${step.image.width}" height="${step.image.height}"></div><figcaption>Step ${step.number}: ${escapeHtml(step.title)}</figcaption></figure>`
            : "";
        return `${section}<article class="step" id="step-${step.number}"><div class="step__heading"><span class="step__number">${step.number}</span><h3>${escapeHtml(step.title)}</h3></div>${description}${figure}</article>`;
    }).join("");

    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title><style>
@page{size:A4;margin:18mm 16mm 20mm}*{box-sizing:border-box}html{font-family:"Aptos","Segoe UI",sans-serif;color:#202421}body{margin:0;font-size:10.5pt;line-height:1.5;overflow-wrap:anywhere}:root{--accent:${document.branding.accentColor};--ink:#202421;--muted:#66706a;--line:#d9dfdb;--soft:#f4f7f5}a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}.cover{min-height:247mm;display:flex;flex-direction:column;justify-content:center;break-after:page;border-top:5mm solid var(--accent);padding:18mm 8mm}.cover__logo{display:block;max-width:58mm;max-height:20mm;object-fit:contain;object-position:left center;margin-bottom:20mm}.cover__mark{display:grid;place-items:center;width:16mm;height:16mm;margin-bottom:20mm;background:var(--accent);color:#fff;font-size:22pt;font-weight:700}.cover__eyebrow,.section-heading span{margin:0 0 3mm;color:var(--accent);font-size:9pt;font-weight:700;text-transform:uppercase}.cover h1{max-width:150mm;margin:0;font-size:30pt;line-height:1.08;letter-spacing:0}.cover__description{max-width:145mm;margin:7mm 0 0;color:var(--muted);font-size:14pt;line-height:1.45}.cover__meta{display:flex;gap:8mm;margin-top:18mm;padding-top:5mm;border-top:1px solid var(--line);color:var(--muted)}.cover__meta strong{color:var(--ink)}.contents{break-after:page}.contents h2{margin:0 0 8mm;font-size:22pt}.contents ol{margin:0;padding:0;list-style:none;border-top:1px solid var(--line)}.contents li{border-bottom:1px solid var(--line)}.contents a{display:flex;justify-content:space-between;gap:8mm;padding:3mm 0;color:var(--ink);text-decoration:none}.toc__section{color:var(--muted);font-size:9pt}.section-heading{break-before:page;margin:0 0 9mm;padding:12mm 0 5mm;border-bottom:2px solid var(--accent)}.section-heading h2{margin:0;font-size:22pt;line-height:1.15}.step{margin:0 0 12mm;break-inside:avoid-page}.step__heading{display:grid;grid-template-columns:11mm 1fr;gap:4mm;align-items:start;margin-bottom:3mm}.step__number{display:grid;place-items:center;width:10mm;height:10mm;background:var(--accent);color:#fff;font-weight:700}.step h3{margin:0;font-size:15pt;line-height:1.25}.step__description{margin:0 0 5mm 15mm;color:#414944}.step figure{margin:0 0 0 15mm}.screenshot{padding:2.5mm;border:1px solid var(--line);background:var(--soft)}.screenshot img{display:block;max-width:100%;max-height:172mm;width:auto;height:auto;margin:auto;object-fit:contain}figcaption{margin-top:2mm;color:var(--muted);font-size:8.5pt}.introduction{margin:0 0 12mm;padding:5mm 6mm;border-left:1.5mm solid var(--accent);background:var(--soft)}h1,h2,h3{break-after:avoid-page}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><section class="cover">${logo}<p class="cover__eyebrow">${escapeHtml(brandName)} guide</p><h1>${escapeHtml(document.title)}</h1>${document.description ? `<p class="cover__description">${htmlTextWithLinks(document.description)}</p>` : ""}<div class="cover__meta"><span>Updated <strong>${escapeHtml(formatExportDate(document.updatedAt))}</strong></span><span><strong>${document.stepCount}</strong> ${document.stepCount === 1 ? "step" : "steps"}</span><span><strong>${document.sections.length}</strong> ${document.sections.length === 1 ? "section" : "sections"}</span></div></section><nav class="contents" aria-labelledby="contents-title"><h2 id="contents-title">Contents</h2><ol>${contents}</ol></nav><main>${document.introduction ? `<div class="introduction">${htmlTextWithLinks(document.introduction)}</div>` : ""}${steps}</main></body></html>`;
    const files = await imageFiles(document, resolveImage);
    if (branding) files.unshift(branding);
    return { entrypoint: "print.html", files: [{ path: "print.html", content: html, mediaType: "text/html" }, ...files] };
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