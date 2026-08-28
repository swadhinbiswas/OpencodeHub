ALTER TABLE "repositories" ADD COLUMN "push_mirror_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "push_mirror_url" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "push_mirror_token" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "last_push_mirror_at" timestamp;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "push_mirror_status" text;
