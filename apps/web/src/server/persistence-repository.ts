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
  guideSteps,
  guides,
  recordingSessions,
  storedObjects,
} from "./db/schema";

export interface StoredObjectRecord extends ImageUploadIntent {
  objectKey: string;
  ownerId: string;
  createdAt: number;
}

export interface PersistenceRepository {
  createGuide(ownerId: string, id: string, write: GuideWrite, now: number): Promise<Guide>;
  getGuide(ownerId: string, guideId: string): Promise<Guide | null>;
  updateGuide(ownerId: string, guideId: string, write: GuideWrite, now: number): Promise<Guide | null>;
  deleteGuide(ownerId: string, guideId: string): Promise<string[]>;
  putSession(ownerId: string, session: RecordingSession): Promise<RecordingSession>;
  getSession(ownerId: string, sessionId: string): Promise<RecordingSession | null>;
  deleteSession(ownerId: string, sessionId: string): Promise<boolean>;
  createObject(record: StoredObjectRecord): Promise<void>;
  getObject(ownerId: string, objectKey: string): Promise<StoredObjectRecord | null>;
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
    updatedAt: guide.updatedAt,
    steps: steps.map((step) => ({
      id: step.id,
      position: step.position,
      title: step.title,
      description: step.description,
      media: step.media,
      annotation: step.annotation,
    })),
  });
}

async function selectGuide(
  database: DatabaseQueryHandle,
  ownerId: string,
  guideId: string,
): Promise<Guide | null> {
  const [guide] = await database
    .select()
    .from(guides)
    .where(and(eq(guides.id, guideId), eq(guides.ownerId, ownerId)))
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

function createRepositoryForDatabase(database: DatabaseQueryHandle): PersistenceRepository {
  return {
    async createGuide(ownerId, id, write, now) {
      await database.insert(guides).values({
        id,
        ownerId,
        version: CONTRACT_VERSION,
        title: write.title,
        description: write.description,
        updatedAt: now,
      });
      await replaceSteps(database, id, write);
      const guide = await selectGuide(database, ownerId, id);

      if (!guide) {
        throw new Error("Created guide could not be loaded");
      }

      return guide;
    },

    getGuide(ownerId, guideId) {
      return selectGuide(database, ownerId, guideId);
    },

    async updateGuide(ownerId, guideId, write, now) {
      const [updated] = await database
        .update(guides)
        .set({ title: write.title, description: write.description, updatedAt: now })
        .where(and(eq(guides.id, guideId), eq(guides.ownerId, ownerId)))
        .returning();

      if (!updated) {
        return null;
      }

      await replaceSteps(database, guideId, write);
      return selectGuide(database, ownerId, guideId);
    },

    async deleteGuide(ownerId, guideId) {
      const objects = await database
        .select({ objectKey: storedObjects.objectKey })
        .from(storedObjects)
        .where(and(eq(storedObjects.guideId, guideId), eq(storedObjects.ownerId, ownerId)));
      const deleted = await database
        .delete(guides)
        .where(and(eq(guides.id, guideId), eq(guides.ownerId, ownerId)))
        .returning();

      return deleted.length === 0 ? [] : objects.map((object) => object.objectKey);
    },

    async putSession(ownerId, session) {
      await database
        .insert(recordingSessions)
        .values({ id: session.id, ownerId, payload: session, updatedAt: session.updatedAt })
        .onConflictDoUpdate({
          target: recordingSessions.id,
          set: { payload: session, updatedAt: session.updatedAt },
          setWhere: eq(recordingSessions.ownerId, ownerId),
        });
      return session;
    },

    async getSession(ownerId, sessionId) {
      const [record] = await database
        .select({ payload: recordingSessions.payload })
        .from(recordingSessions)
        .where(and(
          eq(recordingSessions.id, sessionId),
          eq(recordingSessions.ownerId, ownerId),
        ))
        .limit(1);
      return record ? RecordingSessionSchema.parse(record.payload) : null;
    },

    async deleteSession(ownerId, sessionId) {
      const deleted = await database
        .delete(recordingSessions)
        .where(and(
          eq(recordingSessions.id, sessionId),
          eq(recordingSessions.ownerId, ownerId),
        ))
        .returning();
      return deleted.length > 0;
    },

    async createObject(record) {
      await database.insert(storedObjects).values(record);
    },

    async getObject(ownerId, objectKey) {
      const [record] = await database
        .select()
        .from(storedObjects)
        .where(and(
          eq(storedObjects.objectKey, objectKey),
          eq(storedObjects.ownerId, ownerId),
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
        ownerId: record.ownerId,
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
    createGuide(ownerId, id, write, now) {
      return createTransactionalRepository(handle, (transaction) =>
        transaction.createGuide(ownerId, id, write, now),
      ).then((guide) => {
        if (!guide) {
          throw new Error("Created guide could not be loaded");
        }
        return guide;
      });
    },
    updateGuide(ownerId, guideId, write, now) {
      return createTransactionalRepository(handle, (transaction) =>
        transaction.updateGuide(ownerId, guideId, write, now),
      );
    },
  };
}