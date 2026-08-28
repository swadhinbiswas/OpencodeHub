ALTER TABLE "webhook_deliveries" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "next_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "failure_reason" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_queue_idx" ON "webhook_deliveries" ("status","next_attempt_at");
