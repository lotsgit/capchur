CREATE TABLE "guides" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_steps" (
  "id" uuid PRIMARY KEY NOT NULL,
  "guide_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "media" jsonb,
  "annotation" jsonb,
  CONSTRAINT "guide_steps_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "guide_steps_guide_position_idx" ON "guide_steps" USING btree ("guide_id", "position");
--> statement-breakpoint
CREATE TABLE "recording_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_objects" (
  "object_key" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "guide_id" uuid NOT NULL,
  "step_id" uuid NOT NULL,
  "mime_type" text NOT NULL,
  "byte_length" integer NOT NULL,
  "sha256" text NOT NULL,
  "created_at" bigint NOT NULL,
  CONSTRAINT "stored_objects_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade
);