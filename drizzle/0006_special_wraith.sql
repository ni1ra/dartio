ALTER TABLE "turns" ADD COLUMN "leg_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "darts_thrown" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "aggregate_score" integer;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_leg_number_positive" CHECK ("turns"."leg_number" >= 1);--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_darts_thrown_range" CHECK ("turns"."darts_thrown" between 1 and 3);--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_aggregate_score_range" CHECK ("turns"."aggregate_score" is null or "turns"."aggregate_score" between 0 and 180);