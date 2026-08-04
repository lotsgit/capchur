import { randomUUID } from "node:crypto";

import {
	ExportJobRequestSchema,
	ExportJobSchema,
	type ExportJob,
} from "@capchur/contracts";

import type { WorkspaceAuthenticator, WorkspacePrincipal } from "./auth";
import type { CollaborationRepository } from "./collaboration-repository";
import type { ExportJobRecord, ExportJobRepository } from "./export-job-repository";
import type { ObjectStorage } from "./object-storage";
import type { PersistenceRepository } from "./persistence-repository";

const EXPORT_LIFETIME_MS = 24 * 60 * 60 * 1_000;

function jsonError(status: number, code: string, message: string): Response {
	return Response.json({ error: { code, message } }, { status });
}

export class ExportApi {
	constructor(
		private readonly authenticator: Pick<WorkspaceAuthenticator, "authenticate">,
		private readonly guides: Pick<PersistenceRepository, "getGuide">,
		private readonly jobs: Pick<ExportJobRepository, "enqueue" | "get" | "cancel" | "retry">,
		private readonly storage: Pick<ObjectStorage, "issueDownload">,
		private readonly now: () => number = Date.now,
		private readonly createId: () => string = randomUUID,
		private readonly collaboration?: Pick<CollaborationRepository, "getVisibility">,
	) {}

	private async authorize(request: Request, mutation: boolean): Promise<WorkspacePrincipal | Response> {
		const principal = await this.authenticator.authenticate(request);
		if (!principal) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");
		if (mutation && principal.role !== "owner") {
			return jsonError(403, "FORBIDDEN", "Workspace owner access is required");
		}
		return principal;
	}

	async enqueue(request: Request, guideId: string): Promise<Response> {
		const authorization = await this.authorize(request, true);
		if (authorization instanceof Response) return authorization;
		let input: unknown;
		try {
			input = await request.json();
		} catch {
			input = undefined;
		}
		const parsed = ExportJobRequestSchema.safeParse(input);
		if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Export format is invalid");
		const guide = await this.guides.getGuide(authorization.workspaceId, guideId);
		if (!guide) return jsonError(404, "NOT_FOUND", "Guide not found");

		const now = this.now();
		const job = await this.jobs.enqueue({
			id: this.createId(),
			workspaceId: authorization.workspaceId,
			guide,
			format: parsed.data.format,
			now,
			expiresAt: now + EXPORT_LIFETIME_MS,
		});
		return Response.json(await this.toPublicJob(job), { status: 202 });
	}

	async job(request: Request, jobId: string): Promise<Response> {
		const mutation = request.method !== "GET";
		const authorization = await this.authorize(request, mutation);
		if (authorization instanceof Response) return authorization;

		if (request.method === "GET") {
			const job = await this.jobs.get(authorization.workspaceId, jobId);
			if (job && authorization.role !== "owner" && this.collaboration &&
				await this.collaboration.getVisibility(authorization.workspaceId, job.guideId) !== "workspace") {
				return jsonError(404, "NOT_FOUND", "Export job not found");
			}
			return job
				? Response.json(await this.toPublicJob(job))
				: jsonError(404, "NOT_FOUND", "Export job not found");
		}
		if (request.method === "DELETE") {
			const job = await this.jobs.cancel(authorization.workspaceId, jobId, this.now());
			return job
				? Response.json(await this.toPublicJob(job))
				: jsonError(409, "NOT_CANCELLABLE", "Export job cannot be cancelled");
		}
		if (request.method === "POST") {
			const job = await this.jobs.retry(authorization.workspaceId, jobId, this.now());
			return job
				? Response.json(await this.toPublicJob(job))
				: jsonError(409, "NOT_RETRYABLE", "Export job cannot be retried");
		}
		return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
	}

	private async toPublicJob(job: ExportJobRecord): Promise<ExportJob> {
		const status = job.expiresAt <= this.now() ? "expired" : job.status;
		const download = status === "completed" && job.artifact
			? await this.storage.issueDownload(job.artifact)
			: null;
		return ExportJobSchema.parse({
			id: job.id,
			guideId: job.guideId,
			format: job.format,
			status,
			attempts: job.attempts,
			createdAt: job.createdAt,
			updatedAt: job.updatedAt,
			expiresAt: job.expiresAt,
			error: job.error,
			downloadUrl: download?.downloadUrl ?? null,
		});
	}
}
