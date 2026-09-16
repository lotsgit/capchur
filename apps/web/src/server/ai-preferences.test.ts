// @vitest-environment node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AiPreferencesApi, createAiPreferencesRepository } from "./ai-preferences";
import { WorkspaceAuthenticator } from "./auth";
import type { DatabaseHandle } from "./db";
import * as schema from "./db/schema";

const userId = "ai-preferences-user";
const workspaceId = "ai-preferences-workspace";

function request(method: string, body?: unknown): Request {
  const headers = new Headers({ authorization: "Bearer session-token" });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request("http://capchur.test/api/settings/ai-preferences", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("AI preferences API", () => {
  let client: PGlite;
  let api: AiPreferencesApi;

  beforeAll(async () => {
    client = new PGlite();
    for (const migrationName of [
      "0000_persistence.sql",
      "0001_pale_machine_man.sql",
      "0002_fair_puff_adder.sql",
      "0003_misty_umar.sql",
      "0004_known_bishop.sql",
      "0005_common_deadpool.sql",
      "0006_brown_gertrude_yorkes.sql",
      "0007_nice_domino.sql",
    ]) {
      const migration = await readFile(join(process.cwd(), "drizzle", migrationName), "utf8");
      await client.exec(migration.replaceAll("--> statement-breakpoint", ""));
    }
    const handle: DatabaseHandle = { kind: "local", database: drizzle(client, { schema }) };
    await handle.database.insert(schema.user).values({ id: userId, name: "Pat", email: "pat@example.test" });
    await handle.database.insert(schema.workspaces).values({
      id: workspaceId,
      name: "Preferences workspace",
      slug: "preferences-workspace",
    });
    await handle.database.insert(schema.workspaceMembers).values({
      id: "ai-preferences-membership",
      workspaceId,
      userId,
      role: "owner",
    });

    const authenticator = new WorkspaceAuthenticator(
      { getSession: async () => null },
      handle.database,
      { authenticateToken: async (token) => (token === "session-token" ? { userId, workspaceId, role: "owner" } : null) },
    );
    api = new AiPreferencesApi(authenticator, createAiPreferencesRepository(handle), () => 1_000);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it("returns null preferences before first use, then persists and returns the saved choice", async () => {
    const before = await api.handle(request("GET"));
    expect(await before.json()).toEqual({ preferences: null });

    const saved = await api.handle(request("PUT", { processingMode: "local", triggerMode: "manual" }));
    expect(await saved.json()).toEqual({
      preferences: { processingMode: "local", triggerMode: "manual", configuredAt: 1_000 },
    });

    const after = await api.handle(request("GET"));
    expect(await after.json()).toEqual({
      preferences: { processingMode: "local", triggerMode: "manual", configuredAt: 1_000 },
    });
  });

  it("rejects invalid preference values and unauthenticated requests", async () => {
    const invalid = await api.handle(request("PUT", { processingMode: "cloud", triggerMode: "manual" }));
    expect(invalid.status).toBe(400);

    const unauthenticated = new Request("http://capchur.test/api/settings/ai-preferences", { method: "GET" });
    expect((await api.handle(unauthenticated)).status).toBe(401);
  });
});
