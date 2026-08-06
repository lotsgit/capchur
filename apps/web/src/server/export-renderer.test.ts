// @vitest-environment node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Guide } from "@capchur/contracts";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { renderDocx, renderPdf } from "./export-renderer";

function largeGuide(): Guide {
	return {
		version: 1,
		id: "0198f1d0-c184-7000-8000-000000000501",
		title: "Operate a large workspace safely",
		description: "Follow https://example.com/runbook for the complete policy.",
		introduction: "This guide verifies long-form export pagination and image scaling.",
		branding: { name: "Capchur QA", accentColor: "#164c3b", logoUrl: null },
		updatedAt: 100,
		steps: Array.from({ length: 50 }, (_, index) => ({
			id: `0198f1d0-c184-7000-8000-${String(index + 1).padStart(12, "0")}`,
			position: index,
			title: `Complete workspace operation ${index + 1} without clipping the instruction text`,
			description: `Confirm operation ${index + 1}, review the result, and continue only when the status is complete.`,
			section: index % 10 === 0 ? `Phase ${Math.floor(index / 10) + 1}` : null,
			media: {
				type: "image" as const,
				source: `/api/images/private?objectKey=step-${index + 1}.png`,
				width: 1_440,
				height: 900,
				alt: `Workspace operation ${index + 1}`,
			},
			annotation: null,
		})),
	};
}

describe("large guide rendering", () => {
	it("creates valid PDF and DOCX files with every one of 50 images", async () => {
		const source = await readFile(join(process.cwd(), "public", "fixtures", "release-workspace.svg"));
		let resolvedImages = 0;
		const resolveImage = async () => {
			resolvedImages += 1;
			return source;
		};

		const guide = largeGuide();
		const [pdf, docx] = await Promise.all([
			renderPdf(guide, resolveImage),
			renderDocx(guide, resolveImage),
		]);
		const parsedPdf = await PDFDocument.load(pdf.bytes);
		const firstPage = parsedPdf.getPage(0);

		expect(Buffer.from(pdf.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
		expect(parsedPdf.getPageCount()).toBeGreaterThanOrEqual(25);
		expect(firstPage.getWidth()).toBeCloseTo(595.28, 0);
		expect(firstPage.getHeight()).toBeCloseTo(841.89, 0);
		expect([...docx.bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
		expect(docx.bytes.byteLength).toBeGreaterThan(50_000);
		expect(resolvedImages).toBe(100);
	}, 60_000);
});
