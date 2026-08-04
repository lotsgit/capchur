import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  GuideAccessSchema,
  GuideCommentCreateSchema,
  GuideRevisionRestoreSchema,
  GuideShareCreateSchema,
} from "@capchur/contracts";

import type { WorkspaceAuthenticator, WorkspacePrincipal } from "./auth";
import type { CollaborationRepository } from "./collaboration-repository";
import type { ObjectStorage } from "./object-storage";
import type { PersistenceRepository } from "./persistence-repository";

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

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class CollaborationApi {
  constructor(
    private readonly authenticator: WorkspaceAuthenticator,
    private readonly collaboration: CollaborationRepository,
    private readonly guides: PersistenceRepository,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
    private readonly createToken: () => string = () => randomBytes(32).toString("base64url"),
    private readonly storage?: ObjectStorage,
  ) {}

  private async authorize(request: Request): Promise<WorkspacePrincipal | Response> {
    return await this.authenticator.authenticate(request)
      ?? jsonError(401, "UNAUTHENTICATED", "Authentication is required");
  }

  private requireOwner(principal: WorkspacePrincipal): Response | null {
    return principal.role === "owner"
      ? null
      : jsonError(403, "FORBIDDEN", "Workspace owner access is required");
  }

  private async canRead(principal: WorkspacePrincipal, guideId: string): Promise<boolean> {
    const visibility = await this.collaboration.getVisibility(principal.workspaceId, guideId);
    return visibility !== null && (principal.role === "owner" || visibility === "workspace");
  }

  async access(request: Request, guideId: string): Promise<Response> {
    const principal = await this.authorize(request);
    if (principal instanceof Response) return principal;

    if (request.method === "GET") {
      if (!await this.canRead(principal, guideId)) {
        return jsonError(404, "NOT_FOUND", "Guide not found");
      }
      const visibility = await this.collaboration.getVisibility(principal.workspaceId, guideId);
      return Response.json({ visibility });
    }

    if (request.method === "PUT") {
      const forbidden = this.requireOwner(principal);
      if (forbidden) return forbidden;
      const parsed = GuideAccessSchema.safeParse(await parseJson(request));
      if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Guide access is invalid");
      const updated = await this.collaboration.setVisibility({
        workspaceId: principal.workspaceId,
        guideId,
        actorUserId: principal.userId,
        visibility: parsed.data.visibility,
        auditId: this.createId(),
        now: this.now(),
      });
      return updated
        ? Response.json(parsed.data)
        : jsonError(404, "NOT_FOUND", "Guide not found");
    }

    return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  async shares(request: Request, guideId: string, shareId?: string): Promise<Response> {
    const principal = await this.authorize(request);
    if (principal instanceof Response) return principal;
    const forbidden = this.requireOwner(principal);
    if (forbidden) return forbidden;

    if (request.method === "GET" && !shareId) {
      if (await this.collaboration.getVisibility(principal.workspaceId, guideId) === null) {
        return jsonError(404, "NOT_FOUND", "Guide not found");
      }
      return Response.json(await this.collaboration.listShares(principal.workspaceId, guideId));
    }

    if (request.method === "POST" && !shareId) {
      const parsed = GuideShareCreateSchema.safeParse(await parseJson(request));
      if (!parsed.success || (parsed.data.expiresAt !== null && parsed.data.expiresAt <= this.now())) {
        return jsonError(400, "INVALID_REQUEST", "Share expiry is invalid");
      }
      const token = this.createToken();
      const share = await this.collaboration.createShare({
        id: this.createId(),
        guideId,
        workspaceId: principal.workspaceId,
        actorUserId: principal.userId,
        tokenHash: tokenHash(token),
        expiresAt: parsed.data.expiresAt,
        auditId: this.createId(),
        now: this.now(),
      });
      return share
        ? Response.json({ ...share, token }, { status: 201 })
        : jsonError(404, "NOT_FOUND", "Guide not found");
    }

    if (request.method === "DELETE" && shareId) {
      const revoked = await this.collaboration.revokeShare({
        workspaceId: principal.workspaceId,
        guideId,
        shareId,
        actorUserId: principal.userId,
        auditId: this.createId(),
        now: this.now(),
      });
      return revoked
        ? new Response(null, { status: 204 })
        : jsonError(404, "NOT_FOUND", "Share not found");
    }

    return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  async sharedGuide(request: Request, token: string): Promise<Response> {
    if (request.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const share = await this.collaboration.resolveShare(tokenHash(token), this.now());
    if (!share) return jsonError(404, "NOT_FOUND", "Shared guide not found");
    const guide = await this.guides.getGuide(share.workspaceId, share.guideId);
    return guide
      ? Response.json(guide)
      : jsonError(404, "NOT_FOUND", "Shared guide not found");
  }

  async sharedImage(request: Request, token: string): Promise<Response> {
    if (request.method !== "GET" || !this.storage) {
      return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }
    const share = await this.collaboration.resolveShare(tokenHash(token), this.now());
    const objectKey = new URL(request.url).searchParams.get("objectKey");
    if (!share || !objectKey) return jsonError(404, "NOT_FOUND", "Shared image not found");
    const record = await this.guides.getObject(share.workspaceId, objectKey);
    if (!record || record.guideId !== share.guideId) {
      return jsonError(404, "NOT_FOUND", "Shared image not found");
    }
    const signed = await this.storage.issueDownload(record);
    return fetch(new URL(signed.downloadUrl, request.url));
  }

  async comments(request: Request, guideId: string): Promise<Response> {
    const principal = await this.authorize(request);
    if (principal instanceof Response) return principal;
    if (!await this.canRead(principal, guideId)) {
      return jsonError(404, "NOT_FOUND", "Guide not found");
    }

    if (request.method === "GET") {
      return Response.json(await this.collaboration.listComments(principal.workspaceId, guideId));
    }
    if (request.method === "POST") {
      const parsed = GuideCommentCreateSchema.safeParse(await parseJson(request));
      if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Comment is invalid");
      const comment = await this.collaboration.createComment({
        id: this.createId(),
        workspaceId: principal.workspaceId,
        guideId,
        userId: principal.userId,
        body: parsed.data.body,
        now: this.now(),
      });
      return comment
        ? Response.json(comment, { status: 201 })
        : jsonError(404, "NOT_FOUND", "Guide not found");
    }
    return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  async revisions(request: Request, guideId: string): Promise<Response> {
    const principal = await this.authorize(request);
    if (principal instanceof Response) return principal;
    if (request.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    if (!await this.canRead(principal, guideId)) {
      return jsonError(404, "NOT_FOUND", "Guide not found");
    }
    return Response.json(await this.collaboration.listRevisions(principal.workspaceId, guideId));
  }

  async restore(request: Request, guideId: string): Promise<Response> {
    const principal = await this.authorize(request);
    if (principal instanceof Response) return principal;
    const forbidden = this.requireOwner(principal);
    if (forbidden) return forbidden;
    if (request.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");

    const parsed = GuideRevisionRestoreSchema.safeParse(await parseJson(request));
    if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "Revision restore is invalid");
    const revision = await this.collaboration.getRevision(
      principal.workspaceId,
      guideId,
      parsed.data.revisionId,
    );
    if (!revision) return jsonError(404, "NOT_FOUND", "Revision not found");

    const now = Math.max(this.now(), parsed.data.updatedAt + 1);
    const restored = await this.guides.updateGuide(
      principal.workspaceId,
      guideId,
      {
        title: revision.guide.title,
        description: revision.guide.description,
        introduction: revision.guide.introduction,
        branding: revision.guide.branding,
        steps: revision.guide.steps,
      },
      now,
      parsed.data.updatedAt,
      { id: this.createId(), actorUserId: principal.userId },
    );
    if (!restored) {
      const current = await this.guides.getGuide(principal.workspaceId, guideId);
      return current
        ? jsonError(409, "EDIT_CONFLICT", "The guide changed before this revision was restored")
        : jsonError(404, "NOT_FOUND", "Guide not found");
    }
    await this.collaboration.recordAudit({
      id: this.createId(),
      workspaceId: principal.workspaceId,
      guideId,
      actorUserId: principal.userId,
      action: "revision.restored",
      now,
    });
    return Response.json(restored);
  }

  async audit(request: Request, guideId: string): Promise<Response> {
    const principal = await this.authorize(request);
    if (principal instanceof Response) return principal;
    const forbidden = this.requireOwner(principal);
    if (forbidden) return forbidden;
    if (request.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    if (await this.collaboration.getVisibility(principal.workspaceId, guideId) === null) {
      return jsonError(404, "NOT_FOUND", "Guide not found");
    }
    return Response.json(await this.collaboration.listAuditEvents(principal.workspaceId, guideId));
  }
}
