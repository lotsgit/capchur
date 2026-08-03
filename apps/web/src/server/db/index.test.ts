// @vitest-environment node

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDatabase, type LocalDatabase } from ".";

describe("local database initialization", () => {
  let temporaryRoot: string;
  let dataDirectory: string;
  let database: LocalDatabase;

  beforeAll(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "capchur-db-init-"));
    dataDirectory = join(temporaryRoot, "missing", "data");
    process.env.CAPCHUR_DATA_DIR = dataDirectory;

    const handle = await getDatabase();
    if (handle.kind !== "local") {
      throw new Error("Expected a local database during tests");
    }
    database = handle.database;
  }, 120_000);

  afterAll(async () => {
    delete process.env.CAPCHUR_DATA_DIR;
    await database.$client.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }, 120_000);

  it("creates a missing data directory before running migrations", async () => {
    expect((await stat(join(dataDirectory, "postgres"))).isDirectory()).toBe(true);

    const migrationRows = await database.execute(
      'select count(*)::int as count from "drizzle"."__drizzle_migrations"',
    );
    expect(migrationRows.rows[0]).toMatchObject({ count: expect.any(Number) });
  });
});