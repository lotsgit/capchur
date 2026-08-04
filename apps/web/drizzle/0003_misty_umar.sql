ALTER TABLE "guide_steps" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "guides" ADD COLUMN "introduction" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "guides" ADD COLUMN "branding" jsonb DEFAULT '{"name":"","accentColor":"#164c3b","logoUrl":null}'::jsonb NOT NULL;