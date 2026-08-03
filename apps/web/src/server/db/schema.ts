import type {
  GuideAnnotation,
  GuideMedia,
  RecordingSession,
} from "@capchur/contracts";
import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const guides = pgTable("guides", {
  id: uuid("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const guideSteps = pgTable(
  "guide_steps",
  {
    id: uuid("id").primaryKey(),
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    media: jsonb("media").$type<GuideMedia | null>(),
    annotation: jsonb("annotation").$type<GuideAnnotation | null>(),
  },
  (table) => [
    uniqueIndex("guide_steps_guide_position_idx").on(
      table.guideId,
      table.position,
    ),
  ],
);

export const recordingSessions = pgTable("recording_sessions", {
  id: uuid("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  payload: jsonb("payload").$type<RecordingSession>().notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const storedObjects = pgTable("stored_objects", {
  objectKey: text("object_key").primaryKey(),
  ownerId: text("owner_id").notNull(),
  guideId: uuid("guide_id")
    .notNull()
    .references(() => guides.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").notNull(),
  mimeType: text("mime_type").notNull(),
  byteLength: integer("byte_length").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});