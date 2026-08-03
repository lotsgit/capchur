CREATE TABLE "extension_access_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_authorization_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_syncs" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"guide_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"source_updated_at" bigint NOT NULL,
	"synced_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_syncs" ADD CONSTRAINT "session_syncs_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_syncs_idempotency_key_idx" ON "session_syncs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "session_syncs_workspace_id_idx" ON "session_syncs" USING btree ("workspace_id");