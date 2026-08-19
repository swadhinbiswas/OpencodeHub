ALTER TABLE "repositories" ADD COLUMN "forked_from_url" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "allow_external_pulls" boolean DEFAULT false;