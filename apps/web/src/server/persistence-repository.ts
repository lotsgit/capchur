import {
  CONTRACT_VERSION,
  GuideSchema,
  ImageUploadIntentSchema,
  RecordingSessionSchema,
  type Guide,
  type GuideWrite,
  type ImageUploadIntent,
  type RecordingSession,
} from "@capchur/contracts";
import { and, asc, eq } from "drizzle-orm";

import type {
  CapchurDatabase,
  DatabaseHandle,
  LocalDatabase,
  RemoteDatabase,
} from "./db";
import {
  exportJobs,
  guideSteps,
  guides,
  recordingSessions,
  sessionSyncs,
  storedObjects,
} from "./db/schema";

export type SessionSyncResult =
  | { status: "synced"; guide: Guide; syncedAt: number }
  | { status: "conflict" };

export interface StoredObjectRecord extends ImageUploadIntent {
  objectKey: string;
  workspaceId: string;
  createdAt: number;
}

export interface PersistenceRepository {
  createGuide(workspaceId: string, id: string, write: GuideWrite, now: number): Promise<Guide>;
  getGuide(workspaceId: string, guideId: string): Promise<Guide | null>;
  updateGuide(
    workspaceId: string,
    guideId: string,
    write: GuideWrite,
    now: number,
    expectedUpdatedAt?: number,
  ): Promise<Guide | null>;
  deleteGuide(workspaceId: string, guideId: string): Promise<string[]>;
  putSession(workspaceId: string, session: RecordingSession): Promise<RecordingSession>;
  getSession(workspaceId: string, sessionId: string): Promise<RecordingSession | null>;
  deleteSession(workspaceId: string, sessionId: string): Promise<boolean>;
  syncSession(
    workspaceId: string,
    session: RecordingSession,
    idempotencyKey: string,
    guideId: string,
    now: number,
  ): Promise<SessionSyncResult>;
  attachSessionImage(
    workspaceId: string,
    sessionId: string,
    stepId: string,
    objectKey: string,
  ): Promise<boolean>;
  createObject(record: StoredObjectRecord): Promise<void>;
  getObject(workspaceId: string, objectKey: string): Promise<StoredObjectRecord | null>;
}

type LocalTransaction = Parameters<Parameters<LocalDatabase["transaction"]>[0]>[0];
type RemoteTransaction = Parameters<Parameters<RemoteDatabase["transaction"]>[0]>[0];
type DatabaseQueryHandle = CapchurDatabase | LocalTransaction | RemoteTransaction;

function mapGuide(
  guide: typeof guides.$inferSelect,
  steps: Array<typeof guideSteps.$inferSelect>,
): Guide {
  return GuideSchema.parse({
    version: guide.version,
    id: guide.id,
    title: guide.title,
    description: guide.description,
    introduction: guide.introduction,
    branding: guide.branding,
    updatedAt: guide.updatedAt,
    steps: steps.map((step) => ({
      id: step.id,
      position: step.position,
      title: step.title,
      description: step.description,
      section: step.section,
      media: step.media,
      annotation: step.annotation,
    })),
  });
}

async function selectGuide(
  database: DatabaseQueryHandle,
  workspaceId: string,
  guideId: string,
): Promise<Guide | null> {
  const [guide] = await database
    .select()
    .from(guides)
    .where(and(eq(guides.id, guideId), eq(guides.workspaceId, workspaceId)))
    .limit(1);

  if (!guide) {
    return null;
  }

  const steps = await database
    .select()
    .from(guideSteps)
    .where(eq(guideSteps.guideId, guideId))
    .orderBy(asc(guideSteps.position));

  return mapGuide(guide, steps);
}

async function replaceSteps(
  database: DatabaseQueryHandle,
  guideId: string,
  write: GuideWrite,
): Promise<void> {
  await database.delete(guideSteps).where(eq(guideSteps.guideId, guideId));

  if (write.steps.length > 0) {
    await database.insert(guideSteps).values(
      write.steps.map((step) => ({
        ...step,
        guideId,
      })),
    );
  }
}

function recordingSessionToGuide(session: RecordingSession): GuideWrite {
  return {
    title: "Captured guide",
    description: "Synced from a Capchur browser recording.",
    introduction: "",
    branding: { name: "", accentColor: "#164c3b", logoUrl: null },
    steps: session.steps.map((step, position) => ({
      id: step.id,
      position,
      title: step.description,
      description: step.pageTitle,
      section: null,
      media: null,
      annotation: step.screenshot && step.highlight.coordinateSpace === "screenshot-pixels"
        ? {
            rect: step.highlight.rect,
            coordinateSpace: "image-pixels" as const,
            hidden: step.highlight.hidden,
            crop: null,
            redactions: [],
          }
        : null,
    })),
  };
}

function createRepositoryForDatabase(database: DatabaseQueryHandle): PersistenceRepository {
  return {
    async createGuide(workspaceId, id, write, now) {
      await database.insert(guides).values({
        id,
        workspaceId,
        version: CONTRACT_VERSION,
        title: write.title,
        description: write.description,
        introduction: write.introduction,
        branding: write.branding,
        updatedAt: now,
      });
      await replaceSteps(database, id, write);
      const guide = await selectGuide(database, workspaceId, id);

      if (!guide) {
        throw new Error("Created guide could not be loaded");
      }

      return guide;
    },

    getGuide(workspaceId, guideId) {
      return selectGuide(database, workspaceId, guideId);
    },

    async updateGuide(workspaceId, guideId, write, now, expectedUpdatedAt) {
      const [updated] = await database
        .update(guides)
        .set({
          title: write.title,
          description: write.description,
          introduction: write.introduction,
          branding: write.branding,
          updatedAt: now,
        })
        .where(and(
          eq(guides.id, guideId),
          eq(guides.workspaceId, workspaceId),
          expectedUpdatedAt === undefined ? undefined : eq(guides.updatedAt, expectedUpdatedAt),
        ))
        .returning();

      if (!updated) {
        return null;
      }

      await replaceSteps(database, guideId, write);
      return selectGuide(database, workspaceId, guideId);
    },

    async deleteGuide(workspaceId, guideId) {
      const objects = await database
        .select({ objectKey: storedObjects.objectKey })
        .from(storedObjects)
        .where(and(eq(storedObjects.guideId, guideId), eq(storedObjects.workspaceId, workspaceId)));
      const artifacts = await database
        .select({ objectKey: exportJobs.artifactObjectKey })
        .from(exportJobs)
        .where(and(eq(exportJobs.guideId, guideId), eq(exportJobs.workspaceId, workspaceId)));
      const deleted = await database
        .delete(guides)
        .where(and(eq(guides.id, guideId), eq(guides.workspaceId, workspaceId)))
        .returning();

      return deleted.length === 0 ? [] : [
        ...objects.map((object) => object.objectKey),
        ...artifacts.flatMap(({ objectKey }) => objectKey ? [objectKey] : []),
      ];
    },

    async putSession(workspaceId, session) {
      await database
        .insert(recordingSessions)
        .values({ id: session.id, workspaceId, payload: session, updatedAt: session.updatedAt })
        .onConflictDoUpdate({
          target: recordingSessions.id,
          set: { payload: session, updatedAt: session.updatedAt },
          setWhere: eq(recordingSessions.workspaceId, workspaceId),
        });
      return session;
    },

    async getSession(workspaceId, sessionId) {
      const [record] = await database
        .select({ payload: recordingSessions.payload })
        .from(recordingSessions)
        .where(and(
          eq(recordingSessions.id, sessionId),
          eq(recordingSessions.workspaceId, workspaceId),
        ))
        .limit(1);
      return record ? RecordingSessionSchema.parse(record.payload) : null;
    },

    async deleteSession(workspaceId, sessionId) {
      const deleted = await database
        .delete(recordingSessions)
        .where(and(
          eq(recordingSessions.id, sessionId),
          eq(recordingSessions.workspaceId, workspaceId),
        ))
        .returning();
      return deleted.length > 0;
    },

    async syncSession(workspaceId, recordingSession, idempotencyKey, guideId, now) {
      const [mapping] = await database
        .select()
        .from(sessionSyncs)
        .where(eq(sessionSyncs.sessionId, recordingSession.id))
        .limit(1);

      if (mapping && (
        mapping.workspaceId !== workspaceId ||
        mapping.sourceUpdatedAt > recordingSession.updatedAt
      )) {
        return { status: "conflict" };
      }

      const write = recordingSessionToGuide(recordingSession);
      if (!mapping) {
        await database.insert(recordingSessions).values({
          id: recordingSession.id,
          workspaceId,
          payload: recordingSession,
          updatedAt: recordingSession.updatedAt,
        }).onConflictDoUpdate({
          target: recordingSessions.id,
          set: { payload: recordingSession, updatedAt: recordingSession.updatedAt },
          setWhere: eq(recordingSessions.workspaceId, workspaceId),
        });
        await database.insert(guides).values({
          id: guideId,
          workspaceId,
          version: CONTRACT_VERSION,
          title: write.title,
          description: write.description,
          introduction: write.introduction,
          branding: write.branding,
          updatedAt: now,
        });
        await replaceSteps(database, guideId, write);
        await database.insert(sessionSyncs).values({
          sessionId: recordingSession.id,
          workspaceId,
          guideId,
          idempotencyKey,
          sourceUpdatedAt: recordingSession.updatedAt,
          syncedAt: now,
        });
      } else if (mapping.sourceUpdatedAt < recordingSession.updatedAt) {
        await database.update(recordingSessions).set({
          payload: recordingSession,
          updatedAt: recordingSession.updatedAt,
        }).where(and(
          eq(recordingSessions.id, recordingSession.id),
          eq(recordingSessions.workspaceId, workspaceId),
        ));
        await database.update(guides).set({
          title: write.title,
          description: write.description,
          introduction: write.introduction,
          branding: write.branding,
          updatedAt: now,
        }).where(and(eq(guides.id, mapping.guideId), eq(guides.workspaceId, workspaceId)));
        await replaceSteps(database, mapping.guideId, write);
        await database.update(sessionSyncs).set({
          idempotencyKey,
          sourceUpdatedAt: recordingSession.updatedAt,
          syncedAt: now,
        }).where(eq(sessionSyncs.sessionId, recordingSession.id));
      }

      const persistedGuideId = mapping?.guideId ?? guideId;
      const guide = await selectGuide(database, workspaceId, persistedGuideId);
      if (!guide) throw new Error("Synchronized guide could not be loaded");
      return {
        status: "synced",
        guide,
        syncedAt: mapping?.sourceUpdatedAt === recordingSession.updatedAt
          ? mapping.syncedAt
          : now,
      };
    },

    async attachSessionImage(workspaceId, sessionId, stepId, objectKey) {
      const [mapping] = await database
        .select({ guideId: sessionSyncs.guideId })
        .from(sessionSyncs)
        .where(and(
          eq(sessionSyncs.sessionId, sessionId),
          eq(sessionSyncs.workspaceId, workspaceId),
        ))
        .limit(1);
      if (!mapping) return false;

      const [object] = await database
        .select()
        .from(storedObjects)
        .where(and(
          eq(storedObjects.objectKey, objectKey),
          eq(storedObjects.workspaceId, workspaceId),
          eq(storedObjects.guideId, mapping.guideId),
          eq(storedObjects.stepId, stepId),
        ))
        .limit(1);
      const [storedSession] = await database
        .select({ payload: recordingSessions.payload })
        .from(recordingSessions)
        .where(and(
          eq(recordingSessions.id, sessionId),
          eq(recordingSessions.workspaceId, workspaceId),
        ))
        .limit(1);
      const step = storedSession
        ? RecordingSessionSchema.parse(storedSession.payload).steps.find(({ id }) => id === stepId)
        : undefined;
      if (!object || !step?.screenshot) return false;

      const updated = await database.update(guideSteps).set({
        media: {
          type: "image",
          source: `/api/images/private?objectKey=${encodeURIComponent(objectKey)}`,
          width: step.screenshot.width,
          height: step.screenshot.height,
          alt: step.description,
        },
      }).where(and(eq(guideSteps.guideId, mapping.guideId), eq(guideSteps.id, stepId))).returning();
      return updated.length > 0;
    },

    async createObject(record) {
      await database.insert(storedObjects).values(record);
    },

    async getObject(workspaceId, objectKey) {
      const [record] = await database
        .select()
        .from(storedObjects)
        .where(and(
          eq(storedObjects.objectKey, objectKey),
          eq(storedObjects.workspaceId, workspaceId),
        ))
        .limit(1);
      if (!record) {
        return null;
      }

      const intent = ImageUploadIntentSchema.parse({
        guideId: record.guideId,
        stepId: record.stepId,
        mimeType: record.mimeType,
        byteLength: record.byteLength,
        sha256: record.sha256,
      });
      return {
        ...intent,
        objectKey: record.objectKey,
        workspaceId: record.workspaceId,
        createdAt: record.createdAt,
      };
    },
  };
}

async function createTransactionalRepository(
  handle: DatabaseHandle,
  operation: (repository: PersistenceRepository) => Promise<Guide | null>,
): Promise<Guide | null> {
  if (handle.kind === "local") {
    return handle.database.transaction((transaction) =>
      operation(createRepositoryForDatabase(transaction)),
    );
  }

  return handle.database.transaction((transaction) =>
    operation(createRepositoryForDatabase(transaction)),
  );
}

export function createPersistenceRepository(handle: DatabaseHandle): PersistenceRepository {
  const repository = createRepositoryForDatabase(handle.database);

  return {
    ...repository,
    createGuide(workspaceId, id, write, now) {
      return createTransactionalRepository(handle, (transaction) =>
        transaction.createGuide(workspaceId, id, write, now),
      ).then((guide) => {
        if (!guide) {
          throw new Error("Created guide could not be loaded");
        }
        return guide;
      });
    },
    updateGuide(workspaceId, guideId, write, now, expectedUpdatedAt) {
      return createTransactionalRepository(handle, (transaction) =>
        transaction.updateGuide(workspaceId, guideId, write, now, expectedUpdatedAt),
      );
    },
    syncSession(workspaceId, session, idempotencyKey, guideId, now) {
      if (handle.kind === "local") {
        return handle.database.transaction((transaction) =>
          createRepositoryForDatabase(transaction).syncSession(
            workspaceId,
            session,
            idempotencyKey,
            guideId,
            now,
          ),
        );
      }
      return handle.database.transaction((transaction) =>
        createRepositoryForDatabase(transaction).syncSession(
          workspaceId,
          session,
          idempotencyKey,
          guideId,
          now,
        ),
      );
    },
  };
}