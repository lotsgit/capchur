// @vitest-environment node

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiAuthenticator } from "./auth";
import { PersistenceApi } from "./api";
import type { DatabaseHandle } from "./db";
import * as schema from "./db/schema";
import { LocalObjectStorage } from "./object-storage";
import { createPersistenceRepository } from "./persistence-repository";

const ownerToken = "owner-token-000000000000000000000000";
const otherToken = "other-token-000000000000000000000000";
const guideId = "0198f1d0-c184-7000-8000-000000000301";
const objectId = "0198f1d0-c184-7000-8000-000000000302";
const stepId = "0198f1d0-c184-7000-8000-000000000303";
const sessionId = "0198f1d0-c184-7000-8000-000000000304";

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

describe("persistence API", () => {
  let client: PGlite;
  let dataDirectory: string;
  let api: PersistenceApi;
  let storage: LocalObjectStorage;

  beforeAll(async () => {
    client = new PGlite();
    const migration = await readFile(
      join(process.cwd(), "drizzle", "0000_persistence.sql"),
      "utf8",
    );
    await client.exec(migration.replaceAll("--> statement-breakpoint", ""));
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
    api = new PersistenceApi(
      new ApiAuthenticator(new Map([
        [ownerToken, "owner-a"],
        [otherToken, "owner-b"],
      ])),
      createPersistenceRepository(handle),
      storage,
      () => 1_000,
      () => ids.shift() ?? objectId,
    );
  }, 60_000);

  afterAll(async () => {
    if (client) await client.close();
    if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
  }, 60_000);

  it("requires authentication and isolates guides and sessions by owner", async () => {
    expect((await api.guides(request("/api/guides", "POST", undefined, guideWrite))).status)
      .toBe(401);

    const created = await api.guides(request("/api/guides", "POST", ownerToken, guideWrite));
    expect(created.status).toBe(201);
    expect((await created.json()).id).toBe(guideId);

    const read = await api.guide(request(`/api/guides/${guideId}`, "GET", ownerToken), guideId);
    expect(read.status).toBe(200);

    const updated = await api.guide(request(
      `/api/guides/${guideId}`,
      "PUT",
      ownerToken,
      { ...guideWrite, title: "Persisted guide" },
    ), guideId);
    expect(updated.status).toBe(200);
    expect((await updated.json()).title).toBe("Persisted guide");

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
});