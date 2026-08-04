import type { Guide } from "@capchur/contracts";
import {
	createDocxFile,
	createHtmlBundle,
	type ExportImageResolver,
} from "@capchur/export-core";
import { chromium, type Browser } from "playwright";

export interface RenderedExport {
	bytes: Uint8Array;
	mimeType: string;
	extension: "pdf" | "docx";
}

type BrowserLauncher = () => Promise<Browser>;

function inlineImages(html: string, files: Awaited<ReturnType<typeof createHtmlBundle>>["files"]): string {
	let inlined = html;
	for (const file of files) {
		if (typeof file.content === "string" || file.mediaType !== "image/png") continue;
		const dataUrl = `data:${file.mediaType};base64,${Buffer.from(file.content).toString("base64")}`;
		inlined = inlined.replaceAll(file.path, dataUrl);
	}
	return inlined;
}

export async function renderPdf(
	guide: Guide,
	resolveImage: ExportImageResolver,
	launch: BrowserLauncher = () => chromium.launch({ headless: true }),
): Promise<RenderedExport> {
	const bundle = await createHtmlBundle(guide, resolveImage);
	const entrypoint = bundle.files.find(({ path }) => path === bundle.entrypoint);
	if (!entrypoint || typeof entrypoint.content !== "string") {
		throw new Error("PDF HTML entrypoint is missing");
	}

	const browser = await launch();
	try {
		const page = await browser.newPage();
		await page.setContent(inlineImages(entrypoint.content, bundle.files), { waitUntil: "load" });
		await page.emulateMedia({ media: "print" });
		const bytes = await page.pdf({
			format: "Letter",
			printBackground: true,
			preferCSSPageSize: true,
			tagged: true,
			outline: true,
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
