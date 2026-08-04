// @vitest-environment node

import type { Guide } from "@capchur/contracts";
import { describe, expect, it, vi } from "vitest";

import type { WorkspacePrincipal } from "./auth";
import { ExportApi } from "./export-api";
import type { ExportJobRecord } from "./export-job-repository";

const guide: Guide = {
	version: 1,
	id: "0198f1d0-c184-7000-8000-000000000601",
	title: "Export a guide",
	description: "Boundary test",
	introduction: "",
	branding: { name: "", accentColor: "#164c3b", logoUrl: null },
	updatedAt: 100,
	steps: [],
};
const jobId = "0198f1d0-c184-7000-8000-000000000602";

function request(method: string, workspaceId: string, role: "owner" | "member", body?: unknown) {
	return new Request("http://localhost/api/exports", {
		method,
		headers: {
			"x-workspace": workspaceId,
			"x-role": role,
			...(body ? { "content-type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
}

describe("export API", () => {
	it("enforces ownership and workspace isolation while returning signed downloads", async () => {
		let record: ExportJobRecord | null = null;
		const issueDownload = vi.fn(async () => ({
			downloadUrl: "/api/images/content?token=signed",
			expiresAt: 10_000,
		}));
		const authenticate = vi.fn(async (input: Request): Promise<WorkspacePrincipal> => ({
			userId: "user-a",
			workspaceId: input.headers.get("x-workspace")!,
			role: input.headers.get("x-role") as "owner" | "member",
		}));
		const api = new ExportApi(
			{ authenticate },
			{ getGuide: vi.fn(async (workspaceId) => workspaceId === "workspace-a" ? guide : null) },
			{
				enqueue: vi.fn(async (input) => {
					record = {
						id: input.id,
						workspaceId: input.workspaceId,
						guideId: input.guide.id,
						guide: input.guide,
						format: input.format,
						status: "queued",
						attempts: 0,
						runAfter: input.now,
						artifact: null,
						error: null,
						createdAt: input.now,
						updatedAt: input.now,
						expiresAt: input.expiresAt,
					};
					return record;
				}),
				get: vi.fn(async (workspaceId) => record?.workspaceId === workspaceId ? record : null),
				cancel: vi.fn(async () => null),
				retry: vi.fn(async () => null),
			},
			{ issueDownload },
			() => 200,
			() => jobId,
		);

		const forbidden = await api.enqueue(request("POST", "workspace-a", "member", { format: "pdf" }), guide.id);
		expect(forbidden.status).toBe(403);

		const queued = await api.enqueue(request("POST", "workspace-a", "owner", { format: "pdf" }), guide.id);
		expect(queued.status).toBe(202);
		expect(await queued.json()).toMatchObject({ id: jobId, status: "queued", downloadUrl: null });

		const hidden = await api.job(request("GET", "workspace-b", "member"), jobId);
		expect(hidden.status).toBe(404);

		record = {
			...record!,
			status: "completed",
			attempts: 1,
			artifact: {
				objectKey: `${guide.id}/exports/${jobId}.pdf`,
				mimeType: "application/pdf",
				byteLength: 100,
				sha256: "a".repeat(64),
			},
		};
		const completed = await api.job(request("GET", "workspace-a", "member"), jobId);
		expect(await completed.json()).toMatchObject({
			status: "completed",
			downloadUrl: "/api/images/content?token=signed",
		});

		record = { ...record!, expiresAt: 200 };
		const expired = await api.job(request("GET", "workspace-a", "member"), jobId);
		expect(await expired.json()).toMatchObject({ status: "expired", downloadUrl: null });
		expect(issueDownload).toHaveBeenCalledTimes(1);
	});
});
