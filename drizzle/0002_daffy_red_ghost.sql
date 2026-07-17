DO $$
BEGIN
	IF EXISTS (
		SELECT lower("email")
		FROM "users"
		GROUP BY lower("email")
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot normalize users.email: case-variant duplicate emails require manual identity reconciliation';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "darts" DROP CONSTRAINT "darts_segment_range";--> statement-breakpoint
ALTER TABLE "darts" DROP CONSTRAINT "darts_multiplier_range";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_stripe_customer_uq" ON "users" USING btree ("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "darts" ADD CONSTRAINT "darts_segment_legal" CHECK ("darts"."segment" = 0 or "darts"."segment" between 1 and 20 or "darts"."segment" = 25);--> statement-breakpoint
ALTER TABLE "darts" ADD CONSTRAINT "darts_segment_multiplier_legal" CHECK (("darts"."segment" = 0 and "darts"."multiplier" = 1) or ("darts"."segment" between 1 and 20 and "darts"."multiplier" between 1 and 3) or ("darts"."segment" = 25 and "darts"."multiplier" between 1 and 2));--> statement-breakpoint
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower("users"."email"));
