// @vitest-environment node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GuideWrite } from "@capchur/contracts";

import type { DatabaseHandle } from "./db";
import * as schema from "./db/schema";
import { createExportJobRepository } from "./export-job-repository";
import { createPersistenceRepository } from "./persistence-repository";

const workspaceId = "workspace-a";
const guideId = "0198f1d0-c184-7000-8000-000000000401";
const jobId = "0198f1d0-c184-7000-8000-000000000402";
const secondJobId = "0198f1d0-c184-7000-8000-000000000403";

const guideWrite: GuideWrite = {
	title: "Large export",
	description: "A durable export job.",
	introduction: "Start here.",
	branding: { name: "Capchur", accentColor: "#164c3b", logoUrl: null },
	steps: [],
};

describe("export job repository", () => {
	let client: PGlite;
	let handle: DatabaseHandle;

	beforeEach(async () => {
		client = new PGlite();
		for (const migrationName of [
			"0000_persistence.sql",
			"0001_pale_machine_man.sql",
			"0002_fair_puff_adder.sql",
			"0003_misty_umar.sql",
			"0004_known_bishop.sql",
		]) {
			const migration = await readFile(join(process.cwd(), "drizzle", migrationName), "utf8");
			await client.exec(migration.replaceAll("--> statement-breakpoint", ""));
		}
		handle = { kind: "local", database: drizzle(client, { schema }) };
		await createPersistenceRepository(handle).createGuide(workspaceId, guideId, guideWrite, 100);
	}, 60_000);

	afterEach(async () => {
		await client.close();
	});

	it("persists leases, retries, cancellation, and expiration across repository instances", async () => {
		const guide = (await createPersistenceRepository(handle).getGuide(workspaceId, guideId))!;
		const repository = createExportJobRepository(handle);
		await repository.enqueue({ id: jobId, workspaceId, guide, format: "pdf", now: 200, expiresAt: 10_000 });

		const restarted = createExportJobRepository(handle);
		const claimed = await restarted.claim(200);
		expect(claimed).toMatchObject({ id: jobId, status: "running", attempts: 1 });
		expect(await restarted.get("workspace-b", jobId)).toBeNull();

		await restarted.fail(jobId, "renderer unavailable", 300);
		expect((await restarted.get(workspaceId, jobId))?.status).toBe("queued");
		expect(await restarted.claim(2_299)).toBeNull();
		expect((await restarted.claim(2_300))?.attempts).toBe(2);
		await restarted.complete(jobId, {
			objectKey: `exports/${jobId}.pdf`,
			mimeType: "application/pdf",
			byteLength: 100,
			sha256: "a".repeat(64),
		}, 2_400);

		await restarted.enqueue({ id: secondJobId, workspaceId, guide, format: "docx", now: 2_500, expiresAt: 10_000 });
		expect((await restarted.cancel(workspaceId, secondJobId, 2_600))?.status).toBe("cancelled");
		expect(await restarted.cancel(workspaceId, jobId, 2_600)).toBeNull();

		expect(await restarted.expire(10_000)).toEqual([`exports/${jobId}.pdf`]);
		expect((await restarted.get(workspaceId, jobId))?.status).toBe("expired");
		expect((await restarted.get(workspaceId, secondJobId))?.status).toBe("expired");
	}, 60_000);
});
