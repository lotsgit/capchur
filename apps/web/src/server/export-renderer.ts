import type { Guide } from "@capchur/contracts";
import {
	createDocxFile,
	createPrintHtmlBundle,
	type ExportImageResolver,
} from "@capchur/export-core";
import { chromium, type Browser } from "playwright";

export interface RenderedExport {
	bytes: Uint8Array;
	mimeType: string;
	extension: "pdf" | "docx";
}

type BrowserLauncher = () => Promise<Browser>;

function inlineImages(html: string, files: Awaited<ReturnType<typeof createPrintHtmlBundle>>["files"]): string {
	let inlined = html;
	for (const file of files) {
		if (typeof file.content === "string" || file.mediaType !== "image/png") continue;
		const dataUrl = `data:${file.mediaType};base64,${Buffer.from(file.content).toString("base64")}`;
		inlined = inlined.replaceAll(file.path, dataUrl);
	}
	return inlined;
}

function escapeTemplateText(value: string): string {
	return value.replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	})[character]!);
}

export async function renderPdf(
	guide: Guide,
	resolveImage: ExportImageResolver,
	launch: BrowserLauncher = () => chromium.launch({ headless: true }),
): Promise<RenderedExport> {
	const bundle = await createPrintHtmlBundle(guide, resolveImage);
	const entrypoint = bundle.files.find(({ path }) => path === bundle.entrypoint);
	if (!entrypoint || typeof entrypoint.content !== "string") {
		throw new Error("PDF HTML entrypoint is missing");
	}

	const browser = await launch();
	try {
		const page = await browser.newPage();
		await page.setContent(inlineImages(entrypoint.content, bundle.files), { waitUntil: "load" });
		await page.emulateMedia({ media: "print" });
		const brand = escapeTemplateText(guide.branding.name || "Capchur");
		const title = escapeTemplateText(guide.title);
		const bytes = await page.pdf({
			format: "A4",
			printBackground: true,
			preferCSSPageSize: true,
			tagged: true,
			outline: true,
			displayHeaderFooter: true,
			headerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 16mm;color:#66706a;font:8px Arial,sans-serif"><span style="color:${guide.branding.accentColor};font-weight:700">${brand}</span><span style="float:right">${title}</span></div>`,
			footerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 16mm;color:#66706a;font:8px Arial,sans-serif"><span>Professional guide</span><span style="float:right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
		});
		return { bytes, mimeType: "application/pdf", extension: "pdf" };
	} finally {
		await browser.close();
	}
}

export async function renderDocx(
	guide: Guide,
	resolveImage: ExportImageResolver,
): Promise<RenderedExport> {
	const file = await createDocxFile(guide, resolveImage);
	if (typeof file.content === "string") throw new Error("DOCX renderer returned text content");
	return { bytes: file.content, mimeType: file.mediaType, extension: "docx" };
}
