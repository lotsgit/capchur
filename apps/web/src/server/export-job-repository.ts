import {
	GuideSchema,
	type ExportFormat,
	type ExportJobStatus,
	type Guide,
} from "@capchur/contracts";
import { and, asc, eq, inArray, lt, lte, ne } from "drizzle-orm";

import type { DatabaseHandle } from "./db";
import { exportJobs } from "./db/schema";

const MAX_ATTEMPTS = 3;
const LEASE_MS = 5 * 60 * 1_000;

export interface ExportArtifactMetadata {
	objectKey: string;
	mimeType: string;
	byteLength: number;
	sha256: string;
}

export interface ExportJobRecord {
	id: string;
	workspaceId: string;
	guideId: string;
	guide: Guide;
	format: ExportFormat;
	status: ExportJobStatus;
	attempts: number;
	runAfter: number;
	artifact: ExportArtifactMetadata | null;
	error: string | null;
	createdAt: number;
	updatedAt: number;
	expiresAt: number;
}

function mapJob(row: typeof exportJobs.$inferSelect): ExportJobRecord {
	const artifact = row.artifactObjectKey && row.artifactMimeType &&
		row.artifactByteLength !== null && row.artifactSha256
		? {
				objectKey: row.artifactObjectKey,
				mimeType: row.artifactMimeType,
				byteLength: row.artifactByteLength,
				sha256: row.artifactSha256,
			}
		: null;
	return {
		id: row.id,
		workspaceId: row.workspaceId,
		guideId: row.guideId,
		guide: GuideSchema.parse(row.guideSnapshot),
		format: row.format,
		status: row.status,
		attempts: row.attempts,
		runAfter: row.runAfter,
		artifact,
		error: row.error,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		expiresAt: row.expiresAt,
	};
}

export interface ExportJobRepository {
	enqueue(record: {
		id: string;
		workspaceId: string;
		guide: Guide;
		format: ExportFormat;
		now: number;
		expiresAt: number;
	}): Promise<ExportJobRecord>;
	get(workspaceId: string, jobId: string): Promise<ExportJobRecord | null>;
	claim(now: number): Promise<ExportJobRecord | null>;
	complete(jobId: string, artifact: ExportArtifactMetadata, now: number): Promise<boolean>;
	fail(jobId: string, message: string, now: number): Promise<boolean>;
	cancel(workspaceId: string, jobId: string, now: number): Promise<ExportJobRecord | null>;
	retry(workspaceId: string, jobId: string, now: number): Promise<ExportJobRecord | null>;
	expire(now: number): Promise<string[]>;
}

export function createExportJobRepository(handle: DatabaseHandle): ExportJobRepository {
	const database = handle.database;
	return {
		async enqueue(record) {
			const [row] = await database.insert(exportJobs).values({
				id: record.id,
				workspaceId: record.workspaceId,
				guideId: record.guide.id,
				guideSnapshot: GuideSchema.parse(record.guide),
				format: record.format,
				status: "queued",
				attempts: 0,
				runAfter: record.now,
				createdAt: record.now,
				updatedAt: record.now,
				expiresAt: record.expiresAt,
			}).returning();
			return mapJob(row);
		},

		async get(workspaceId, jobId) {
			const [row] = await database.select().from(exportJobs).where(and(
				eq(exportJobs.id, jobId),
				eq(exportJobs.workspaceId, workspaceId),
			)).limit(1);
			return row ? mapJob(row) : null;
		},

		async claim(now) {
			const [candidate] = await database.select().from(exportJobs).where(and(
				inArray(exportJobs.status, ["queued", "running"]),
				lte(exportJobs.runAfter, now),
				lt(exportJobs.attempts, MAX_ATTEMPTS),
			)).orderBy(asc(exportJobs.runAfter), asc(exportJobs.createdAt)).limit(1);
			if (!candidate) return null;

			const [claimed] = await database.update(exportJobs).set({
				status: "running",
				attempts: candidate.attempts + 1,
				runAfter: now + LEASE_MS,
				updatedAt: now,
				error: null,
			}).where(and(
				eq(exportJobs.id, candidate.id),
				eq(exportJobs.status, candidate.status),
				lte(exportJobs.runAfter, now),
			)).returning();
			return claimed ? mapJob(claimed) : null;
		},

		async complete(jobId, artifact, now) {
			const rows = await database.update(exportJobs).set({
				status: "completed",
				artifactObjectKey: artifact.objectKey,
				artifactMimeType: artifact.mimeType,
				artifactByteLength: artifact.byteLength,
				artifactSha256: artifact.sha256,
				updatedAt: now,
				error: null,
			}).where(and(eq(exportJobs.id, jobId), eq(exportJobs.status, "running"))).returning();
			return rows.length === 1;
		},

		async fail(jobId, message, now) {
			const [job] = await database.select().from(exportJobs)
				.where(and(eq(exportJobs.id, jobId), eq(exportJobs.status, "running"))).limit(1);
			if (!job) return false;
			const terminal = job.attempts >= MAX_ATTEMPTS;
			const rows = await database.update(exportJobs).set({
				status: terminal ? "failed" : "queued",
				runAfter: terminal ? job.runAfter : now + (2 ** job.attempts) * 1_000,
				updatedAt: now,
				error: message.slice(0, 2_000),
			}).where(and(eq(exportJobs.id, jobId), eq(exportJobs.status, "running"))).returning();
			return rows.length === 1;
		},

		async cancel(workspaceId, jobId, now) {
			const [row] = await database.update(exportJobs).set({
				status: "cancelled",
				updatedAt: now,
			}).where(and(
				eq(exportJobs.id, jobId),
				eq(exportJobs.workspaceId, workspaceId),
				inArray(exportJobs.status, ["queued", "running"]),
			)).returning();
			return row ? mapJob(row) : null;
		},

		async retry(workspaceId, jobId, now) {
			const [row] = await database.update(exportJobs).set({
				status: "queued",
				attempts: 0,
				runAfter: now,
				updatedAt: now,
				error: null,
			}).where(and(
				eq(exportJobs.id, jobId),
				eq(exportJobs.workspaceId, workspaceId),
				eq(exportJobs.status, "failed"),
			)).returning();
			return row ? mapJob(row) : null;
		},

		async expire(now) {
			const rows = await database.select({
				id: exportJobs.id,
				objectKey: exportJobs.artifactObjectKey,
			}).from(exportJobs).where(and(
				lte(exportJobs.expiresAt, now),
				ne(exportJobs.status, "expired"),
			));
			if (rows.length === 0) return [];
			await database.update(exportJobs).set({ status: "expired", updatedAt: now })
				.where(inArray(exportJobs.id, rows.map(({ id }) => id)));
			return rows.flatMap(({ objectKey }) => objectKey ? [objectKey] : []);
		},
	};
}
