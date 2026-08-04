// @vitest-environment node

import type { Guide } from "@capchur/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ExportJobRecord } from "./export-job-repository";
import { ExportService } from "./export-service";

const guide: Guide = {
	version: 1,
	id: "0198f1d0-c184-7000-8000-000000000701",
	title: "Worker test",
	description: "Render through the durable worker.",
	introduction: "",
	branding: { name: "", accentColor: "#164c3b", logoUrl: null },
	updatedAt: 100,
	steps: [],
};

describe("export service", () => {
	it("deletes expired artifacts and completes a claimed render with integrity metadata", async () => {
		const job: ExportJobRecord = {
			id: "0198f1d0-c184-7000-8000-000000000702",
			workspaceId: "workspace-a",
			guideId: guide.id,
			guide,
			format: "pdf",
			status: "running",
			attempts: 1,
			runAfter: 1_000,
			artifact: null,
			error: null,
			createdAt: 100,
			updatedAt: 200,
			expiresAt: 10_000,
		};
		const claim = vi.fn()
			.mockResolvedValueOnce(job)
			.mockResolvedValueOnce(null);
		const complete = vi.fn(async () => true);
		const put = vi.fn(async () => undefined);
		const remove = vi.fn(async () => undefined);
		const service = new ExportService(
			{
				expire: vi.fn(async () => ["expired/export.pdf"]),
				claim,
				complete,
				fail: vi.fn(async () => true),
			},
			{ getObject: vi.fn(async () => null) },
			{ put, delete: remove, read: vi.fn(async () => new Uint8Array()) },
			{
				pdf: vi.fn(async () => ({
					bytes: new Uint8Array([1, 2, 3]),
					mimeType: "application/pdf",
					extension: "pdf" as const,
				})),
				docx: vi.fn(async () => ({
					bytes: new Uint8Array(),
					mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
					extension: "docx" as const,
				})),
			},
			() => 500,
		);

		await service.processAvailable();

		expect(remove).toHaveBeenCalledWith(["expired/export.pdf"]);
		expect(put).toHaveBeenCalledWith(expect.objectContaining({
			objectKey: `${guide.id}/exports/${job.id}.pdf`,
			mimeType: "application/pdf",
			byteLength: 3,
			sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
		}), new Uint8Array([1, 2, 3]));
		expect(complete).toHaveBeenCalledWith(
			job.id,
			expect.objectContaining({ objectKey: `${guide.id}/exports/${job.id}.pdf` }),
			500,
		);
	});
});
