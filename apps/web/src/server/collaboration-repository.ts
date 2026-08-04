import {
  GuideAuditEventSchema,
  GuideCommentSchema,
  GuideRevisionSchema,
  GuideShareSchema,
  type GuideAuditEvent,
  type GuideComment,
  type GuideRevision,
  type GuideShare,
  type GuideVisibility,
} from "@capchur/contracts";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { DatabaseHandle } from "./db";
import {
  guideAccess,
  guideAuditEvents,
  guideComments,
  guideRevisions,
  guideShares,
  guides,
  user,
  type GuideAuditAction,
} from "./db/schema";

export interface CollaborationRepository {
  getVisibility(workspaceId: string, guideId: string): Promise<GuideVisibility | null>;
  setVisibility(input: {
    workspaceId: string;
    guideId: string;
    actorUserId: string;
    visibility: GuideVisibility;
    auditId: string;
    now: number;
  }): Promise<boolean>;
  createShare(input: {
    id: string;
    guideId: string;
    workspaceId: string;
    actorUserId: string;
    tokenHash: string;
    expiresAt: number | null;
    auditId: string;
    now: number;
  }): Promise<GuideShare | null>;
  listShares(workspaceId: string, guideId: string): Promise<GuideShare[]>;
  revokeShare(input: {
    workspaceId: string;
    guideId: string;
    shareId: string;
    actorUserId: string;
    auditId: string;
    now: number;
  }): Promise<boolean>;
  resolveShare(tokenHash: string, now: number): Promise<{ workspaceId: string; guideId: string } | null>;
  createComment(input: {
    id: string;
    workspaceId: string;
    guideId: string;
    userId: string;
    body: string;
    now: number;
  }): Promise<GuideComment | null>;
  listComments(workspaceId: string, guideId: string): Promise<GuideComment[]>;
  listRevisions(workspaceId: string, guideId: string): Promise<GuideRevision[]>;
  getRevision(workspaceId: string, guideId: string, revisionId: string): Promise<GuideRevision | null>;
  recordAudit(input: {
    id: string;
    workspaceId: string;
    guideId: string;
    actorUserId: string;
    action: GuideAuditAction;
    now: number;
  }): Promise<void>;
  listAuditEvents(workspaceId: string, guideId: string): Promise<GuideAuditEvent[]>;
}

export function createCollaborationRepository(handle: DatabaseHandle): CollaborationRepository {
  const database = handle.database;

  async function guideExists(workspaceId: string, guideId: string): Promise<boolean> {
    const records = await database
      .select({ id: guides.id })
      .from(guides)
      .where(and(eq(guides.id, guideId), eq(guides.workspaceId, workspaceId)))
      .limit(1);
    return records.length > 0;
  }

  async function insertAudit(input: {
    id: string;
    workspaceId: string;
    guideId: string;
    actorUserId: string;
    action: GuideAuditAction;
    now: number;
  }): Promise<void> {
    await database.insert(guideAuditEvents).values({
      id: input.id,
      workspaceId: input.workspaceId,
      guideId: input.guideId,
      actorUserId: input.actorUserId,
      action: input.action,
      createdAt: input.now,
    });
  }

  return {
    async getVisibility(workspaceId, guideId) {
      if (!await guideExists(workspaceId, guideId)) return null;
      const [access] = await database
        .select({ visibility: guideAccess.visibility })
        .from(guideAccess)
        .where(and(eq(guideAccess.guideId, guideId), eq(guideAccess.workspaceId, workspaceId)))
        .limit(1);
      return access?.visibility ?? "private";
    },

    async setVisibility(input) {
      if (!await guideExists(input.workspaceId, input.guideId)) return false;
      await database.transaction(async (transaction) => {
        await transaction.insert(guideAccess).values({
          guideId: input.guideId,
          workspaceId: input.workspaceId,
          visibility: input.visibility,
          updatedAt: input.now,
        }).onConflictDoUpdate({
          target: guideAccess.guideId,
          set: { visibility: input.visibility, updatedAt: input.now },
        });
        await transaction.insert(guideAuditEvents).values({
          id: input.auditId,
          workspaceId: input.workspaceId,
          guideId: input.guideId,
          actorUserId: input.actorUserId,
          action: "visibility.changed",
          createdAt: input.now,
        });
      });
      return true;
    },

    async createShare(input) {
      if (!await guideExists(input.workspaceId, input.guideId)) return null;
      await database.transaction(async (transaction) => {
        await transaction.insert(guideShares).values({
          id: input.id,
          workspaceId: input.workspaceId,
          guideId: input.guideId,
          tokenHash: input.tokenHash,
          createdAt: input.now,
          expiresAt: input.expiresAt,
          revokedAt: null,
        });
        await transaction.insert(guideAuditEvents).values({
          id: input.auditId,
          workspaceId: input.workspaceId,
          guideId: input.guideId,
          actorUserId: input.actorUserId,
          action: "share.created",
          createdAt: input.now,
        });
      });
      return GuideShareSchema.parse({
        id: input.id,
        guideId: input.guideId,
        createdAt: input.now,
        expiresAt: input.expiresAt,
        revokedAt: null,
      });
    },

    async listShares(workspaceId, guideId) {
      const records = await database
        .select()
        .from(guideShares)
        .where(and(eq(guideShares.workspaceId, workspaceId), eq(guideShares.guideId, guideId)))
        .orderBy(desc(guideShares.createdAt));
      return records.map((record) => GuideShareSchema.parse({
        id: record.id,
        guideId: record.guideId,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        revokedAt: record.revokedAt,
      }));
    },

    async revokeShare(input) {
      const revoked = await database.transaction(async (transaction) => {
        const records = await transaction
          .update(guideShares)
          .set({ revokedAt: input.now })
          .where(and(
            eq(guideShares.id, input.shareId),
            eq(guideShares.guideId, input.guideId),
            eq(guideShares.workspaceId, input.workspaceId),
            isNull(guideShares.revokedAt),
          ))
          .returning();
        if (records.length > 0) {
          await transaction.insert(guideAuditEvents).values({
            id: input.auditId,
            workspaceId: input.workspaceId,
            guideId: input.guideId,
            actorUserId: input.actorUserId,
            action: "share.revoked",
            createdAt: input.now,
          });
        }
        return records.length > 0;
      });
      return revoked;
    },

    async resolveShare(tokenHash, now) {
      const [share] = await database
        .select({
          workspaceId: guideShares.workspaceId,
          guideId: guideShares.guideId,
          expiresAt: guideShares.expiresAt,
        })
        .from(guideShares)
        .where(and(eq(guideShares.tokenHash, tokenHash), isNull(guideShares.revokedAt)))
        .limit(1);
      if (!share || (share.expiresAt !== null && share.expiresAt <= now)) return null;
      return { workspaceId: share.workspaceId, guideId: share.guideId };
    },

    async createComment(input) {
      if (!await guideExists(input.workspaceId, input.guideId)) return null;
      await database.insert(guideComments).values({
        id: input.id,
        workspaceId: input.workspaceId,
        guideId: input.guideId,
        userId: input.userId,
        body: input.body,
        createdAt: input.now,
      });
      const comments = await this.listComments(input.workspaceId, input.guideId);
      return comments.find((comment) => comment.id === input.id) ?? null;
    },

    async listComments(workspaceId, guideId) {
      const records = await database
        .select({
          id: guideComments.id,
          guideId: guideComments.guideId,
          userId: guideComments.userId,
          authorName: user.name,
          body: guideComments.body,
          createdAt: guideComments.createdAt,
        })
        .from(guideComments)
        .innerJoin(user, eq(guideComments.userId, user.id))
        .where(and(eq(guideComments.workspaceId, workspaceId), eq(guideComments.guideId, guideId)))
        .orderBy(asc(guideComments.createdAt));
      return records.map((record) => GuideCommentSchema.parse(record));
    },

    async listRevisions(workspaceId, guideId) {
      const records = await database
        .select()
        .from(guideRevisions)
        .where(and(eq(guideRevisions.workspaceId, workspaceId), eq(guideRevisions.guideId, guideId)))
        .orderBy(desc(guideRevisions.createdAt));
      return records.map((record) => GuideRevisionSchema.parse({
        id: record.id,
        guideId: record.guideId,
        actorUserId: record.actorUserId,
        createdAt: record.createdAt,
        guide: record.guideSnapshot,
      }));
    },

    async getRevision(workspaceId, guideId, revisionId) {
      const [record] = await database
        .select()
        .from(guideRevisions)
        .where(and(
          eq(guideRevisions.id, revisionId),
          eq(guideRevisions.workspaceId, workspaceId),
          eq(guideRevisions.guideId, guideId),
        ))
        .limit(1);
      return record ? GuideRevisionSchema.parse({
        id: record.id,
        guideId: record.guideId,
        actorUserId: record.actorUserId,
        createdAt: record.createdAt,
        guide: record.guideSnapshot,
      }) : null;
    },

    recordAudit(input) {
      return insertAudit(input);
    },

    async listAuditEvents(workspaceId, guideId) {
      const records = await database
        .select()
        .from(guideAuditEvents)
        .where(and(eq(guideAuditEvents.workspaceId, workspaceId), eq(guideAuditEvents.guideId, guideId)))
        .orderBy(desc(guideAuditEvents.createdAt));
      return records.map((record) => GuideAuditEventSchema.parse({
        id: record.id,
        guideId: record.guideId,
        actorUserId: record.actorUserId,
        action: record.action,
        createdAt: record.createdAt,
      }));
    },
  };
}
