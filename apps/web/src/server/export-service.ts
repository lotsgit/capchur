import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import type { ExportFormat, Guide } from "@capchur/contracts";
import type { ExportImageResolver } from "@capchur/export-core";

import type {
	ExportJobRecord,
	ExportJobRepository,
} from "./export-job-repository";
import { renderDocx, renderPdf, type RenderedExport } from "./export-renderer";
import type { ObjectStorage } from "./object-storage";
import type { PersistenceRepository } from "./persistence-repository";

const MAX_JOBS_PER_RUN = 5;

type ExportRenderer = (guide: Guide, resolveImage: ExportImageResolver) => Promise<RenderedExport>;

export class ExportService {
	constructor(
		private readonly jobs: Pick<ExportJobRepository, "expire" | "claim" | "complete" | "fail">,
		private readonly guides: Pick<PersistenceRepository, "getObject">,
		private readonly storage: Pick<ObjectStorage, "delete" | "put" | "read">,
		private readonly renderers: Record<ExportFormat, ExportRenderer> = {
			pdf: renderPdf,
			docx: renderDocx,
		},
		private readonly now: () => number = Date.now,
	) {}

	async processAvailable(): Promise<void> {
		const expiredKeys = await this.jobs.expire(this.now());
		await this.storage.delete(expiredKeys);

		for (let index = 0; index < MAX_JOBS_PER_RUN; index += 1) {
			const job = await this.jobs.claim(this.now());
			if (!job) return;
			await this.process(job);
		}
	}

	private async process(job: ExportJobRecord): Promise<void> {
		let artifactKey: string | null = null;
		try {
			const rendered = await this.renderers[job.format](
				job.guide,
				this.createImageResolver(job),
			);
			artifactKey = `${job.guideId}/exports/${job.id}.${rendered.extension}`;
			const artifact = {
				objectKey: artifactKey,
				mimeType: rendered.mimeType,
				byteLength: rendered.bytes.byteLength,
				sha256: createHash("sha256").update(rendered.bytes).digest("hex"),
			};
			await this.storage.put(artifact, rendered.bytes);
			if (!await this.jobs.complete(job.id, artifact, this.now())) {
				await this.storage.delete([artifactKey]);
			}
		} catch {
			if (artifactKey) await this.storage.delete([artifactKey]);
			await this.jobs.fail(job.id, "Export rendering failed", this.now());
		}
	}

	private createImageResolver(job: ExportJobRecord): ExportImageResolver {
		return async (source) => {
			const url = new URL(source, "http://capchur.local");
			if (url.origin !== "http://capchur.local") {
				throw new Error("Remote export images are not supported");
			}

			if (url.pathname === "/api/images/private") {
				const objectKey = url.searchParams.get("objectKey");
				if (!objectKey) throw new Error("Private image key is missing");
				const record = await this.guides.getObject(job.workspaceId, objectKey);
				if (!record || record.guideId !== job.guideId) {
					throw new Error("Private image does not belong to this guide");
				}
				return this.storage.read(objectKey);
			}

			if (!url.pathname.startsWith("/fixtures/")) {
				throw new Error("Export image source is not supported");
			}
			const publicRoot = resolve(process.cwd(), "public");
			const path = resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
			if (!path.startsWith(`${publicRoot}${sep}`)) throw new Error("Invalid public image path");
			return readFile(path);
		};
	}
}
