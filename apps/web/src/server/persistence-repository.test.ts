// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GuideWrite } from "@capchur/contracts";

import type { DatabaseHandle } from "./db";
import * as schema from "./db/schema";
import { createPersistenceRepository } from "./persistence-repository";

const workspaceId = "workspace-a";
const otherWorkspaceId = "workspace-b";
const guideId = "0198f1d0-c184-7000-8000-000000000201";
const otherGuideId = "0198f1d0-c184-7000-8000-000000000202";
const stepId = "0198f1d0-c184-7000-8000-000000000203";
const otherStepId = "0198f1d0-c184-7000-8000-000000000204";

function write(title: string, id = stepId): GuideWrite {
  return {
    title,
    description: "A persisted guide",
    steps: [{
      id,
      position: 0,
      title: "First step",
      description: "Complete the first step.",
      media: null,
      annotation: null,
    }],
  };
}

describe("persistence repository", () => {
  let client: PGlite;
  let handle: DatabaseHandle;
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), "capchur-database-"));
    client = new PGlite(join(dataDirectory, "postgres"));
    for (const migrationName of [
      "0000_persistence.sql",
      "0001_pale_machine_man.sql",
      "0002_fair_puff_adder.sql",
    ]) {
      const migration = await readFile(join(process.cwd(), "drizzle", migrationName), "utf8");
      await client.exec(migration.replaceAll("--> statement-breakpoint", ""));
    }
    handle = { kind: "local", database: drizzle(client, { schema }) };
  }, 60_000);

  afterEach(async () => {
    await client.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }, 60_000);

  it("supports guide CRUD while hiding another workspace's records", async () => {
    const repository = createPersistenceRepository(handle);
    const created = await repository.createGuide(workspaceId, guideId, write("Draft"), 100);

    expect(created.title).toBe("Draft");
    expect(await repository.getGuide(otherWorkspaceId, guideId)).toBeNull();
    expect(await repository.updateGuide(otherWorkspaceId, guideId, write("Stolen"), 200)).toBeNull();

    const updated = await repository.updateGuide(workspaceId, guideId, write("Published"), 200);
    expect(updated?.title).toBe("Published");

    await client.close();
    client = new PGlite(join(dataDirectory, "postgres"));
    handle = { kind: "local", database: drizzle(client, { schema }) };
    const restartedRepository = createPersistenceRepository(handle);
    expect((await restartedRepository.getGuide(workspaceId, guideId))?.title).toBe("Published");

    expect(await restartedRepository.deleteGuide(otherWorkspaceId, guideId)).toEqual([]);
    await restartedRepository.deleteGuide(workspaceId, guideId);
    expect(await restartedRepository.getGuide(workspaceId, guideId)).toBeNull();
  }, 60_000);

  it("rolls back guide metadata when step replacement fails", async () => {
    const repository = createPersistenceRepository(handle);
    await repository.createGuide(workspaceId, guideId, write("Original"), 100);
    await repository.createGuide(workspaceId, otherGuideId, write("Other", otherStepId), 100);

    await expect(
      repository.updateGuide(workspaceId, guideId, write("Broken", otherStepId), 200),
    ).rejects.toThrow();

    const persisted = await repository.getGuide(workspaceId, guideId);
    expect(persisted?.title).toBe("Original");
    expect(persisted?.steps[0]?.id).toBe(stepId);
  });

  it("maps repeated session uploads to one guide and rejects stale revisions", async () => {
    const repository = createPersistenceRepository(handle);
    const sessionId = "0198f1d0-c184-7000-8000-000000000205";
    const idempotencyKey = "0198f1d0-c184-7000-8000-000000000206";
    const session = {
      id: sessionId,
      status: "stopped" as const,
      startedAt: 100,
      updatedAt: 300,
      steps: [],
    };

    const first = await repository.syncSession(
      workspaceId,
      session,
      idempotencyKey,
      guideId,
      1_000,
    );
    const repeated = await repository.syncSession(
      workspaceId,
      session,
      idempotencyKey,
      otherGuideId,
      2_000,
    );
    const stale = await repository.syncSession(
      workspaceId,
      { ...session, updatedAt: 200 },
      "0198f1d0-c184-7000-8000-000000000207",
      otherGuideId,
      3_000,
    );

    expect(first).toMatchObject({ status: "synced", guide: { id: guideId } });
    expect(repeated).toMatchObject({
      status: "synced",
      guide: { id: guideId },
      syncedAt: 1_000,
    });
    expect(stale).toEqual({ status: "conflict" });
    expect(await repository.getGuide(workspaceId, otherGuideId)).toBeNull();
  });
});