// @vitest-environment node

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WorkspaceAuthenticator, type AuthSession } from "./auth";
import { ExtensionApi, PersistenceApi } from "./api";
import type { DatabaseHandle } from "./db";
import * as schema from "./db/schema";
import { ExtensionAuthorizationService } from "./extension-auth";
import { LocalObjectStorage } from "./object-storage";
import { createPersistenceRepository } from "./persistence-repository";

const ownerToken = "owner-token-000000000000000000000000";
const otherToken = "other-token-000000000000000000000000";
const memberToken = "member-token-00000000000000000000000";
const expiredToken = "expired-token-0000000000000000000000";
const ownerUserId = "user-a";
const otherUserId = "user-b";
const memberUserId = "user-c";
const ownerWorkspaceId = "workspace-a";
const otherWorkspaceId = "workspace-b";
const guideId = "0198f1d0-c184-7000-8000-000000000301";
const objectId = "0198f1d0-c184-7000-8000-000000000302";
const stepId = "0198f1d0-c184-7000-8000-000000000303";
const sessionId = "0198f1d0-c184-7000-8000-000000000304";
const syncGuideId = "0198f1d0-c184-7000-8000-000000000305";
const idempotencyKey = "0198f1d0-c184-7000-8000-000000000306";

const guideWrite = {
  title: "Persist a guide",
  description: "Exercise the trusted persistence boundary.",
  steps: [{
    id: stepId,
    position: 0,
    title: "Upload an image",
    description: "Use a signed upload URL.",
    media: null,
    annotation: null,
  }],
};

function request(
  path: string,
  method: string,
  token?: string,
  body?: unknown,
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function authSession(userId: string): AuthSession {
  return {
    user: { id: userId, name: userId, email: `${userId}@example.test` },
    session: { id: `session-${userId}`, expiresAt: new Date("2100-01-01") },
  };
}

describe("persistence API", () => {
  let client: PGlite;
  let dataDirectory: string;
  let api: PersistenceApi;
  let extensionApi: ExtensionApi;
  let storage: LocalObjectStorage;

  beforeAll(async () => {
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
    const handle: DatabaseHandle = {
      kind: "local",
      database: drizzle(client, { schema }),
    };
    dataDirectory = await mkdtemp(join(tmpdir(), "capchur-storage-"));
    storage = new LocalObjectStorage(
      dataDirectory,
      "test-signing-secret-0000000000000000",
    );
    const ids = [guideId, objectId];
    await handle.database.insert(schema.user).values([
      { id: ownerUserId, name: "Owner", email: "owner@example.test" },
      { id: otherUserId, name: "Other", email: "other@example.test" },
      { id: memberUserId, name: "Member", email: "member@example.test" },
    ]);
    await handle.database.insert(schema.workspaces).values([
      { id: ownerWorkspaceId, name: "Owner workspace", slug: "owner-workspace" },
      { id: otherWorkspaceId, name: "Other workspace", slug: "other-workspace" },
    ]);
    await handle.database.insert(schema.workspaceMembers).values([
      { id: "membership-a", workspaceId: ownerWorkspaceId, userId: ownerUserId, role: "owner" },
      { id: "membership-b", workspaceId: otherWorkspaceId, userId: otherUserId, role: "owner" },
      { id: "membership-c", workspaceId: ownerWorkspaceId, userId: memberUserId, role: "member" },
    ]);
    const sessions = new Map([
      [ownerToken, authSession(ownerUserId)],
      [otherToken, authSession(otherUserId)],
      [memberToken, authSession(memberUserId)],
      [expiredToken, {
        ...authSession(ownerUserId),
        session: { id: "expired-session", expiresAt: new Date(0) },
      }],
    ]);
    const authenticator = new WorkspaceAuthenticator({
      getSession: async (headers) => {
        const authorization = headers.get("authorization");
        return authorization?.startsWith("Bearer ")
          ? sessions.get(authorization.slice("Bearer ".length)) ?? null
          : null;
      },
    }, handle.database);
    const repository = createPersistenceRepository(handle);
    api = new PersistenceApi(
      authenticator,
      repository,
      storage,
      () => 1_000,
      () => ids.shift() ?? objectId,
    );
    extensionApi = new ExtensionApi(
      authenticator,
      new ExtensionAuthorizationService(handle.database),
      repository,
      () => 2_000,
      () => syncGuideId,
    );
  }, 60_000);

  afterAll(async () => {
    if (client) await client.close();
    if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
  }, 60_000);

  it("keeps authorization exchange responses compatible with legacy extensions", async () => {
    const legacyAuthorization = await extensionApi.authorize(
      request("/api/extension/authorize", "POST", ownerToken),
    );
    const legacyCode = (await legacyAuthorization.json() as { code: string }).code;
    const legacyExchange = await extensionApi.exchange(
      request("/api/extension/exchange", "POST", undefined, { code: legacyCode }),
    );
    expect(Object.keys(await legacyExchange.json()).sort()).toEqual(["accessToken", "expiresAt"]);

    const namedAuthorization = await extensionApi.authorize(
      request("/api/extension/authorize", "POST", ownerToken),
    );
    const namedCode = (await namedAuthorization.json() as { code: string }).code;
    const namedExchange = await extensionApi.exchange(
      request("/api/extension/exchange", "POST", undefined, {
        code: namedCode,
        includeUserName: true,
      }),
    );
    expect(await namedExchange.json()).toMatchObject({ userName: "Owner" });
  });

  it("requires authentication and isolates guides and sessions by workspace", async () => {
    expect((await api.guides(request("/api/guides", "POST", undefined, guideWrite))).status)
      .toBe(401);
    expect((await api.guides(request("/api/guides", "POST", expiredToken, guideWrite))).status)
      .toBe(401);

    const created = await api.guides(request("/api/guides", "POST", ownerToken, guideWrite));
    expect(created.status).toBe(201);
    const createdGuide = await created.json();
    expect(createdGuide.id).toBe(guideId);

    const ownerGuides = await api.guides(request("/api/guides", "GET", ownerToken));
    expect(ownerGuides.status).toBe(200);
    expect(await ownerGuides.json()).toEqual([createdGuide]);

    const otherGuides = await api.guides(request("/api/guides", "GET", otherToken));
    expect(otherGuides.status).toBe(200);
    expect(await otherGuides.json()).toEqual([]);

    const read = await api.guide(request(`/api/guides/${guideId}`, "GET", ownerToken), guideId);
    expect(read.status).toBe(200);

    expect((await api.guide(
      request(`/api/guides/${guideId}`, "GET", memberToken),
      guideId,
    )).status).toBe(200);
    expect((await api.guide(request(
      `/api/guides/${guideId}`,
      "PUT",
      memberToken,
      { ...guideWrite, title: "Member mutation" },
    ), guideId)).status).toBe(403);

    const updated = await api.guide(request(
      `/api/guides/${guideId}`,
      "PUT",
      ownerToken,
      {
        updatedAt: createdGuide.updatedAt,
        guide: { ...guideWrite, title: "Persisted guide" },
      },
    ), guideId);
    expect(updated.status).toBe(200);
    expect((await updated.json()).title).toBe("Persisted guide");

    const conflict = await api.guide(request(
      `/api/guides/${guideId}`,
      "PUT",
      ownerToken,
      {
        updatedAt: createdGuide.updatedAt,
        guide: { ...guideWrite, title: "Stale guide" },
      },
    ), guideId);
    expect(conflict.status).toBe(409);
    await expect((await api.guide(request(`/api/guides/${guideId}`, "GET", ownerToken), guideId)).json())
      .resolves.toMatchObject({ title: "Persisted guide" });

    expect((await api.guide(request(`/api/guides/${guideId}`, "GET", otherToken), guideId)).status)
      .toBe(404);

    const session = {
      id: sessionId,
      status: "stopped",
      startedAt: 100,
      updatedAt: 200,
      steps: [],
    };
    expect((await api.session(
      request(`/api/sessions/${sessionId}`, "PUT", ownerToken, { session }),
      sessionId,
    )).status).toBe(200);
    expect((await api.session(
      request(`/api/sessions/${sessionId}`, "GET", otherToken),
      sessionId,
    )).status).toBe(404);
  });

  it("round-trips image bytes through signed local URLs", async () => {
    const bytes = Buffer.from("signed image bytes");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const intent = await api.imageUploadIntent(request(
      "/api/images/upload-intent",
      "POST",
      ownerToken,
      {
        guideId,
        stepId,
        mimeType: "image/png",
        byteLength: bytes.byteLength,
        sha256,
      },
    ));
    expect(intent.status).toBe(201);
    const signedUpload = await intent.json();
    const uploadToken = new URL(signedUpload.uploadUrl, "http://localhost").searchParams.get("token");
    if (!uploadToken) throw new Error("Upload token was not issued");

    const upload = await storage.receiveUpload(
      new Request("http://localhost/upload", {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: bytes,
      }),
      uploadToken,
    );
    expect(upload.status).toBe(204);

    storage = new LocalObjectStorage(
      dataDirectory,
      "test-signing-secret-0000000000000000",
    );

    const downloadIntent = await api.imageDownloadIntent(request(
      `/api/images/download-intent?objectKey=${encodeURIComponent(signedUpload.objectKey)}`,
      "GET",
      ownerToken,
    ));
    const signedDownload = await downloadIntent.json();
    const downloadToken = new URL(signedDownload.downloadUrl, "http://localhost")
      .searchParams.get("token");
    if (!downloadToken) throw new Error("Download token was not issued");
    const download = await storage.serveDownload(downloadToken);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);

    expect((await api.guide(
      request(`/api/guides/${guideId}`, "DELETE", ownerToken),
      guideId,
    )).status).toBe(204);
    expect((await storage.serveDownload(downloadToken)).status).toBe(404);
  });

  it("requires authentication and returns one guide for repeated sync delivery", async () => {
    const session = {
      id: sessionId,
      status: "stopped" as const,
      startedAt: 100,
      updatedAt: 300,
      steps: [],
    };
    const body = { idempotencyKey, session };
    expect((await extensionApi.syncSession(
      request(`/api/sync/sessions/${sessionId}`, "PUT", undefined, body),
      sessionId,
    )).status).toBe(401);

    const first = await extensionApi.syncSession(
      request(`/api/sync/sessions/${sessionId}`, "PUT", ownerToken, body),
      sessionId,
    );
    const repeated = await extensionApi.syncSession(
      request(`/api/sync/sessions/${sessionId}`, "PUT", ownerToken, body),
      sessionId,
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ guideId: syncGuideId, sessionId });
    expect(await repeated.json()).toMatchObject({ guideId: syncGuideId, sessionId });
  });
});