ALTER TABLE "webhook_events" ALTER COLUMN "processed_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "processed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "processing_started_at" timestamp with time zone;