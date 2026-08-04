import type {
  GuideAnnotation,
  GuideBranding,
  GuideMedia,
  RecordingSession,
} from "@capchur/contracts";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export type WorkspaceRole = "owner" | "member";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_user_idx").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_members_user_id_idx").on(table.userId),
  ],
);

export const guides = pgTable("guides", {
  id: uuid("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  introduction: text("introduction").default("").notNull(),
  branding: jsonb("branding").$type<GuideBranding>().default({
    name: "",
    accentColor: "#164c3b",
    logoUrl: null,
  }).notNull(),
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
    section: text("section"),
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
  workspaceId: text("workspace_id").notNull(),
  payload: jsonb("payload").$type<RecordingSession>().notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const extensionAuthorizationCodes = pgTable("extension_authorization_codes", {
  codeHash: text("code_hash").primaryKey(),
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  role: text("role").$type<WorkspaceRole>().notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

export const extensionAccessTokens = pgTable("extension_access_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  role: text("role").$type<WorkspaceRole>().notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

export const sessionSyncs = pgTable(
  "session_syncs",
  {
    sessionId: uuid("session_id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    sourceUpdatedAt: bigint("source_updated_at", { mode: "number" }).notNull(),
    syncedAt: bigint("synced_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("session_syncs_idempotency_key_idx").on(table.idempotencyKey),
    index("session_syncs_workspace_id_idx").on(table.workspaceId),
  ],
);

export const storedObjects = pgTable("stored_objects", {
  objectKey: text("object_key").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  guideId: uuid("guide_id")
    .notNull()
    .references(() => guides.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").notNull(),
  mimeType: text("mime_type").notNull(),
  byteLength: integer("byte_length").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});