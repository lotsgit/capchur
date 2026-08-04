CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"guide_id" uuid NOT NULL,
	"guide_snapshot" jsonb NOT NULL,
	"format" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" bigint NOT NULL,
	"artifact_object_key" text,
	"artifact_mime_type" text,
	"artifact_byte_length" integer,
	"artifact_sha256" text,
	"error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_jobs_workspace_id_idx" ON "export_jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "export_jobs_status_run_after_idx" ON "export_jobs" USING btree ("status","run_after");