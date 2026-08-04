import { randomUUID } from "node:crypto";

import {
  ExtensionAuthorizationExchangeSchema,
  GuideUpdateRequestSchema,
  GuideWriteSchema,
  ImageUploadIntentSchema,
  RecordingSessionWriteSchema,
  SessionImageAttachmentSchema,
  SessionSyncRequestSchema,
  SessionSyncResponseSchema,
} from "@capchur/contracts";

import type { WorkspaceAuthenticator, WorkspacePrincipal } from "./auth";
import type { CollaborationRepository } from "./collaboration-repository";
import type { ExtensionAuthorizationService } from "./extension-auth";
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
    private readonly authenticator: WorkspaceAuthenticator,
    private readonly repository: PersistenceRepository,
    private readonly storage: ObjectStorage,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
    private readonly collaboration?: CollaborationRepository,
  ) {}

  private async authorize(request: Request, mutation = false): Promise<WorkspacePrincipal | Response> {
    const principal = await this.authenticator.authenticate(request);
    if (!principal) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");
    if (mutation && principal.role !== "owner") {
      return jsonError(403, "FORBIDDEN", "Workspace owner access is required");
    }
    return principal;
  }

  private async canReadGuide(principal: WorkspacePrincipal, guideId: string): Promise<boolean> {
    if (!this.collaboration || principal.role === "owner") return true;
    return await this.collaboration.getVisibility(principal.workspaceId, guideId) === "workspace";
  }

  async guides(request: Request): Promise<Response> {
    if (request.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const authorization = await this.authorize(request, true);
    if (authorization instanceof Response) return authorization;

    const parsed = GuideWriteSchema.safeParse(await parseJson(request));
    if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Guide data is invalid");

    try {
      const guide = await this.repository.createGuide(
        authorization.workspaceId,
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
    const authorization = await this.authorize(request, request.method !== "GET");
    if (authorization instanceof Response) return authorization;
    const { workspaceId } = authorization;

    if (request.method === "GET") {
      if (!await this.canReadGuide(authorization, guideId)) {
        return jsonError(404, "NOT_FOUND", "Guide not found");
      }
      const guide = await this.repository.getGuide(workspaceId, guideId);
      return guide ? Response.json(guide) : jsonError(404, "NOT_FOUND", "Guide not found");
    }

    if (request.method === "PUT") {
      const parsed = GuideUpdateRequestSchema.safeParse(await parseJson(request));
      if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Guide data is invalid");
      try {
        const guide = await this.repository.updateGuide(
          workspaceId,
          guideId,
          parsed.data.guide,
          Math.max(this.now(), parsed.data.updatedAt + 1),
          parsed.data.updatedAt,
          this.collaboration
            ? { id: this.createId(), actorUserId: authorization.userId }
            : undefined,
        );
        if (guide) return Response.json(guide);
        const current = await this.repository.getGuide(workspaceId, guideId);
        return current
          ? jsonError(409, "EDIT_CONFLICT", "The guide changed in another editor")
          : jsonError(404, "NOT_FOUND", "Guide not found");
      } catch {
        return jsonError(500, "PERSISTENCE_ERROR", "The guide could not be updated");
      }
    }

    if (request.method === "DELETE") {
      const objectKeys = await this.repository.deleteGuide(workspaceId, guideId);
      if (objectKeys.length === 0) {
        const guide = await this.repository.getGuide(workspaceId, guideId);
        if (!guide) return new Response(null, { status: 204 });
      }
      await this.storage.delete(objectKeys);
      return new Response(null, { status: 204 });
    }

    return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  async session(request: Request, sessionId?: string): Promise<Response> {
    const authorization = await this.authorize(request, request.method !== "GET");
    if (authorization instanceof Response) return authorization;
    const { workspaceId } = authorization;

    if (request.method === "PUT") {
      const parsed = RecordingSessionWriteSchema.safeParse(await parseJson(request));
      if (!parsed.success || (sessionId && parsed.data.session.id !== sessionId)) {
        return jsonError(400, "INVALID_REQUEST", "Session data is invalid");
      }
      return Response.json(await this.repository.putSession(workspaceId, parsed.data.session));
    }
    if (!sessionId) return jsonError(400, "INVALID_REQUEST", "Session ID is required");
    if (request.method === "GET") {
      const session = await this.repository.getSession(workspaceId, sessionId);
      return session ? Response.json(session) : jsonError(404, "NOT_FOUND", "Session not found");
    }
    if (request.method === "DELETE") {
      await this.repository.deleteSession(workspaceId, sessionId);
      return new Response(null, { status: 204 });
    }
    return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  async imageUploadIntent(request: Request): Promise<Response> {
    const authorization = await this.authorize(request, true);
    if (authorization instanceof Response) return authorization;
    const { workspaceId } = authorization;

    const parsed = ImageUploadIntentSchema.safeParse(await parseJson(request));
    if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Image metadata is invalid");
    const guide = await this.repository.getGuide(workspaceId, parsed.data.guideId);
    if (!guide || !guide.steps.some((step) => step.id === parsed.data.stepId)) {
      return jsonError(404, "NOT_FOUND", "Guide step not found");
    }

    const extension = parsed.data.mimeType === "image/png" ? "png" :
      parsed.data.mimeType === "image/jpeg" ? "jpg" : "webp";
    const record: StoredObjectRecord = {
      ...parsed.data,
      workspaceId,
      objectKey: `${parsed.data.guideId}/${this.createId()}.${extension}`,
      createdAt: this.now(),
    };
    await this.repository.createObject(record);
    return Response.json(await this.storage.issueUpload(record), { status: 201 });
  }

  async imageDownloadIntent(request: Request): Promise<Response> {
    const authorization = await this.authorize(request);
    if (authorization instanceof Response) return authorization;
    const objectKey = new URL(request.url).searchParams.get("objectKey");
    if (!objectKey) return jsonError(400, "INVALID_REQUEST", "Object key is required");
    const record = await this.repository.getObject(authorization.workspaceId, objectKey);
    return record && await this.canReadGuide(authorization, record.guideId)
      ? Response.json(await this.storage.issueDownload(record))
      : jsonError(404, "NOT_FOUND", "Image not found");
  }

  async privateImage(request: Request): Promise<Response> {
    const authorization = await this.authorize(request);
    if (authorization instanceof Response) return authorization;
    const objectKey = new URL(request.url).searchParams.get("objectKey");
    if (!objectKey) return jsonError(400, "INVALID_REQUEST", "Object key is required");
    const record = await this.repository.getObject(authorization.workspaceId, objectKey);
    if (!record || !await this.canReadGuide(authorization, record.guideId)) {
      return jsonError(404, "NOT_FOUND", "Image not found");
    }
    const signed = await this.storage.issueDownload(record);
    return fetch(new URL(signed.downloadUrl, request.url));
  }
}

export class ExtensionApi {
  constructor(
    private readonly authenticator: WorkspaceAuthenticator,
    private readonly authorization: ExtensionAuthorizationService,
    private readonly repository: PersistenceRepository,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  async authorize(request: Request): Promise<Response> {
    if (request.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const principal = await this.authenticator.authenticate(request);
    if (!principal) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");
    if (principal.role !== "owner") {
      return jsonError(403, "FORBIDDEN", "Workspace owner access is required");
    }
    return Response.json({ code: await this.authorization.issueCode(principal) }, { status: 201 });
  }

  async exchange(request: Request): Promise<Response> {
    if (request.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const parsed = ExtensionAuthorizationExchangeSchema.safeParse(await parseJson(request));
    if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Authorization code is invalid");
    const credential = await this.authorization.exchangeCode(parsed.data.code);
    return credential
      ? Response.json(credential)
      : jsonError(401, "INVALID_GRANT", "Authorization code is invalid or expired");
  }

  async syncSession(request: Request, sessionId: string): Promise<Response> {
    if (request.method !== "PUT") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const principal = await this.authenticator.authenticate(request);
    if (!principal) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");
    if (principal.role !== "owner") {
      return jsonError(403, "FORBIDDEN", "Workspace owner access is required");
    }
    const parsed = SessionSyncRequestSchema.safeParse(await parseJson(request));
    if (!parsed.success || parsed.data.session.id !== sessionId) {
      return jsonError(400, "INVALID_REQUEST", "Session sync data is invalid");
    }

    try {
      const result = await this.repository.syncSession(
        principal.workspaceId,
        parsed.data.session,
        parsed.data.idempotencyKey,
        this.createId(),
        this.now(),
      );
      if (result.status === "conflict") {
        return jsonError(409, "SYNC_CONFLICT", "A newer session revision is already synced");
      }
      return Response.json(SessionSyncResponseSchema.parse({
        guideId: result.guide.id,
        sessionId,
        syncedAt: result.syncedAt,
      }));
    } catch {
      return jsonError(500, "SYNC_FAILED", "The session could not be synced");
    }
  }

  async attachImage(request: Request, sessionId: string): Promise<Response> {
    if (request.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const principal = await this.authenticator.authenticate(request);
    if (!principal) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");
    if (principal.role !== "owner") {
      return jsonError(403, "FORBIDDEN", "Workspace owner access is required");
    }
    const parsed = SessionImageAttachmentSchema.safeParse(await parseJson(request));
    if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Image attachment is invalid");
    const attached = await this.repository.attachSessionImage(
      principal.workspaceId,
      sessionId,
      parsed.data.stepId,
      parsed.data.objectKey,
    );
    return attached
      ? new Response(null, { status: 204 })
      : jsonError(404, "NOT_FOUND", "Synchronized guide image was not found");
  }
}