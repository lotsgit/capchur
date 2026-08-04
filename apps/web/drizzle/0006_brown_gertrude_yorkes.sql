CREATE TABLE "guide_access" (
	"guide_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guide_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guide_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guide_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"guide_snapshot" jsonb NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guide_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint,
	"revoked_at" bigint
);
--> statement-breakpoint
ALTER TABLE "guide_access" ADD CONSTRAINT "guide_access_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_audit_events" ADD CONSTRAINT "guide_audit_events_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_comments" ADD CONSTRAINT "guide_comments_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_shares" ADD CONSTRAINT "guide_shares_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guide_audit_events_guide_created_idx" ON "guide_audit_events" USING btree ("guide_id","created_at");--> statement-breakpoint
CREATE INDEX "guide_comments_guide_created_idx" ON "guide_comments" USING btree ("guide_id","created_at");--> statement-breakpoint
CREATE INDEX "guide_revisions_guide_created_idx" ON "guide_revisions" USING btree ("guide_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guide_shares_token_hash_idx" ON "guide_shares" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "guide_shares_guide_id_idx" ON "guide_shares" USING btree ("guide_id");