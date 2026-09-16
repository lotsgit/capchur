ALTER TABLE "ai_description_usage" ADD COLUMN "feature" text DEFAULT 'description' NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_steps" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ai_processing_mode" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ai_trigger_mode" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ai_preferences_set_at" bigint;