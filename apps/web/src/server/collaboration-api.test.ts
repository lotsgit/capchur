// @vitest-environment node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WorkspaceAuthenticator, type AuthSession } from "./auth";
import { CollaborationApi } from "./collaboration-api";
import { createCollaborationRepository } from "./collaboration-repository";
import type { DatabaseHandle } from "./db";
import * as schema from "./db/schema";
import { createPersistenceRepository } from "./persistence-repository";

const workspaceId = "workspace-collaboration";
const ownerUserId = "collaboration-owner";
const memberUserId = "collaboration-member";
const guideId = "0198f1d0-c184-7000-8000-000000000401";
const stepId = "0198f1d0-c184-7000-8000-000000000402";
const firstRevisionId = "0198f1d0-c184-7000-8000-000000000403";
const secondRevisionId = "0198f1d0-c184-7000-8000-000000000404";
const token = "revocable-link-token-with-at-least-thirty-two-characters";

const baseWrite = {
  title: "Private guide",
  description: "Collaboration acceptance guide.",
  introduction: "",
  branding: { name: "", accentColor: "#164c3b", logoUrl: null },
  steps: [{
    id: stepId,
    position: 0,
    title: "Collaborate",
    description: "Review this guide.",
    section: null,
    media: null,
    annotation: null,
  }],
};

function authSession(userId: string, name: string): AuthSession {
  return {
    user: { id: userId, name, email: `${userId}@example.test` },
    session: { id: `${userId}-session`, expiresAt: new Date("2099-01-01") },
  };
}

function request(method: string, bearer: string | null, body?: unknown): Request {
  const headers = new Headers();
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request("http://capchur.test/api", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("collaboration API", () => {
  let client: PGlite;
  let api: CollaborationApi;
  let persistence: ReturnType<typeof createPersistenceRepository>;

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
    ]) {
      const migration = await readFile(join(process.cwd(), "drizzle", migrationName), "utf8");
      await client.exec(migration.replaceAll("--> statement-breakpoint", ""));
    }
    const handle: DatabaseHandle = {
      kind: "local",
      database: drizzle(client, { schema }),
    };
    await handle.database.insert(schema.user).values([
      { id: ownerUserId, name: "Owner", email: "owner@example.test" },
      { id: memberUserId, name: "Member", email: "member@example.test" },
    ]);
    await handle.database.insert(schema.workspaces).values({
      id: workspaceId,
      name: "Collaboration workspace",
      slug: "collaboration-workspace",
    });
    await handle.database.insert(schema.workspaceMembers).values([
      { id: "collaboration-membership-owner", workspaceId, userId: ownerUserId, role: "owner" },
      { id: "collaboration-membership-member", workspaceId, userId: memberUserId, role: "member" },
    ]);

    const sessions = new Map([
      ["owner-token", authSession(ownerUserId, "Owner")],
      ["member-token", authSession(memberUserId, "Member")],
    ]);
    const authenticator = new WorkspaceAuthenticator({
      getSession: async (headers) => {
        const authorization = headers.get("authorization");
        return authorization?.startsWith("Bearer ")
          ? sessions.get(authorization.slice("Bearer ".length)) ?? null
          : null;
      },
    }, handle.database);
    const collaboration = createCollaborationRepository(handle);
    persistence = createPersistenceRepository(handle);
    const ids = Array.from({ length: 20 }, (_, index) =>
      `0198f1d0-c184-7000-8000-${String(500 + index).padStart(12, "0")}`,
    );
    api = new CollaborationApi(
      authenticator,
      collaboration,
      persistence,
      () => 1_000,
      () => ids.shift()!,
      () => token,
    );
    await persistence.createGuide(workspaceId, guideId, baseWrite, 100);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it("controls workspace access, comments, revocable links, history, conflicts, and audit", async () => {
    expect((await api.access(request("GET", "member-token"), guideId)).status).toBe(404);

    const workspaceAccess = await api.access(
      request("PUT", "owner-token", { visibility: "workspace" }),
      guideId,
    );
    expect(workspaceAccess.status).toBe(200);
    expect(await workspaceAccess.json()).toEqual({ visibility: "workspace" });

    const commentResponse = await api.comments(
      request("POST", "member-token", { body: "Please clarify the final step." }),
      guideId,
    );
    expect(commentResponse.status).toBe(201);
    expect((await commentResponse.json()).authorName).toBe("Member");
    expect(await (await api.comments(request("GET", "owner-token"), guideId)).json())
      .toHaveLength(1);

    const shareResponse = await api.shares(
      request("POST", "owner-token", { expiresAt: null }),
      guideId,
    );
    expect(shareResponse.status).toBe(201);
    const share = await shareResponse.json();
    expect(share.token).toBe(token);
    expect((await api.sharedGuide(request("GET", null), token)).status).toBe(200);

    expect((await api.shares(
      request("DELETE", "owner-token"),
      guideId,
      share.id,
    )).status).toBe(204);
    expect((await api.sharedGuide(request("GET", null), token)).status).toBe(404);

    const first = await persistence.updateGuide(
      workspaceId,
      guideId,
      { ...baseWrite, title: "First saved version" },
      200,
      100,
      { id: firstRevisionId, actorUserId: ownerUserId },
    );
    const second = await persistence.updateGuide(
      workspaceId,
      guideId,
      { ...baseWrite, title: "Second saved version" },
      300,
      first!.updatedAt,
      { id: secondRevisionId, actorUserId: ownerUserId },
    );
    expect(second?.title).toBe("Second saved version");

    const revisions = await (await api.revisions(request("GET", "member-token"), guideId)).json();
    expect(revisions.map((revision: { guide: { title: string } }) => revision.guide.title))
      .toEqual(["Second saved version", "First saved version"]);

    const staleRestore = await api.restore(
      request("POST", "owner-token", { revisionId: firstRevisionId, updatedAt: 200 }),
      guideId,
    );
    expect(staleRestore.status).toBe(409);
    expect((await persistence.getGuide(workspaceId, guideId))?.title).toBe("Second saved version");

    const restored = await api.restore(
      request("POST", "owner-token", { revisionId: firstRevisionId, updatedAt: 300 }),
      guideId,
    );
    expect(restored.status).toBe(200);
    expect((await restored.json()).title).toBe("First saved version");

    const audit = await (await api.audit(request("GET", "owner-token"), guideId)).json();
    expect(audit).toHaveLength(4);
    expect(audit.map((event: { action: string }) => event.action)).toEqual(expect.arrayContaining([
      "revision.restored",
      "share.revoked",
      "share.created",
      "visibility.changed",
    ]));
    expect((await api.audit(request("GET", "member-token"), guideId)).status).toBe(403);
  }, 60_000);
});
