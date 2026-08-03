import { randomUUID } from "node:crypto";

import {
  GuideWriteSchema,
  ImageUploadIntentSchema,
  RecordingSessionWriteSchema,
} from "@capchur/contracts";

import type { ApiAuthenticator } from "./auth";
import type { ObjectStorage } from "./object-storage";
import type { PersistenceRepository, StoredObjectRecord } from "./persistence-repository";

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export class PersistenceApi {
  constructor(
    private readonly authenticator: ApiAuthenticator,
    private readonly repository: PersistenceRepository,
    private readonly storage: ObjectStorage,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  async guides(request: Request): Promise<Response> {
    const ownerId = this.authenticator.authenticate(request);
    if (!ownerId) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");
    if (request.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");

    const parsed = GuideWriteSchema.safeParse(await parseJson(request));
    if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Guide data is invalid");

    try {
      const guide = await this.repository.createGuide(
        ownerId,
        this.createId(),
        parsed.data,
        this.now(),
      );
      return Response.json(guide, { status: 201 });
    } catch {
      return jsonError(500, "PERSISTENCE_ERROR", "The guide could not be created");
    }
  }

  async guide(request: Request, guideId: string): Promise<Response> {
    const ownerId = this.authenticator.authenticate(request);
    if (!ownerId) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");

    if (request.method === "GET") {
      const guide = await this.repository.getGuide(ownerId, guideId);
      return guide ? Response.json(guide) : jsonError(404, "NOT_FOUND", "Guide not found");
    }

    if (request.method === "PUT") {
      const parsed = GuideWriteSchema.safeParse(await parseJson(request));
      if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Guide data is invalid");
      try {
        const guide = await this.repository.updateGuide(ownerId, guideId, parsed.data, this.now());
        return guide ? Response.json(guide) : jsonError(404, "NOT_FOUND", "Guide not found");
      } catch {
        return jsonError(500, "PERSISTENCE_ERROR", "The guide could not be updated");
      }
    }

    if (request.method === "DELETE") {
      const objectKeys = await this.repository.deleteGuide(ownerId, guideId);
      if (objectKeys.length === 0) {
        const guide = await this.repository.getGuide(ownerId, guideId);
        if (!guide) return new Response(null, { status: 204 });
      }
      await this.storage.delete(objectKeys);
      return new Response(null, { status: 204 });
    }

    return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  async session(request: Request, sessionId?: string): Promise<Response> {
    const ownerId = this.authenticator.authenticate(request);
    if (!ownerId) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");

    if (request.method === "PUT") {
      const parsed = RecordingSessionWriteSchema.safeParse(await parseJson(request));
      if (!parsed.success || (sessionId && parsed.data.session.id !== sessionId)) {
        return jsonError(400, "INVALID_REQUEST", "Session data is invalid");
      }
      return Response.json(await this.repository.putSession(ownerId, parsed.data.session));
    }
    if (!sessionId) return jsonError(400, "INVALID_REQUEST", "Session ID is required");
    if (request.method === "GET") {
      const session = await this.repository.getSession(ownerId, sessionId);
      return session ? Response.json(session) : jsonError(404, "NOT_FOUND", "Session not found");
    }
    if (request.method === "DELETE") {
      await this.repository.deleteSession(ownerId, sessionId);
      return new Response(null, { status: 204 });
    }
    return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  async imageUploadIntent(request: Request): Promise<Response> {
    const ownerId = this.authenticator.authenticate(request);
    if (!ownerId) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");

    const parsed = ImageUploadIntentSchema.safeParse(await parseJson(request));
    if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Image metadata is invalid");
    const guide = await this.repository.getGuide(ownerId, parsed.data.guideId);
    if (!guide || !guide.steps.some((step) => step.id === parsed.data.stepId)) {
      return jsonError(404, "NOT_FOUND", "Guide step not found");
    }

    const extension = parsed.data.mimeType === "image/png" ? "png" :
      parsed.data.mimeType === "image/jpeg" ? "jpg" : "webp";
    const record: StoredObjectRecord = {
      ...parsed.data,
      ownerId,
      objectKey: `${parsed.data.guideId}/${this.createId()}.${extension}`,
      createdAt: this.now(),
    };
    await this.repository.createObject(record);
    return Response.json(await this.storage.issueUpload(record), { status: 201 });
  }

  async imageDownloadIntent(request: Request): Promise<Response> {
    const ownerId = this.authenticator.authenticate(request);
    if (!ownerId) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");
    const objectKey = new URL(request.url).searchParams.get("objectKey");
    if (!objectKey) return jsonError(400, "INVALID_REQUEST", "Object key is required");
    const record = await this.repository.getObject(ownerId, objectKey);
    return record
      ? Response.json(await this.storage.issueDownload(record))
      : jsonError(404, "NOT_FOUND", "Image not found");
  }
}