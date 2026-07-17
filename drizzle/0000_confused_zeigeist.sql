CREATE TYPE "public"."match_status" AS ENUM('pending', 'active', 'complete', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."room_member_role" AS ENUM('owner', 'player', 'spectator');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete');--> statement-breakpoint
CREATE TABLE "darts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"segment" integer NOT NULL,
	"multiplier" integer NOT NULL,
	"x_microunits" integer,
	"y_microunits" integer,
	CONSTRAINT "darts_ordinal_range" CHECK ("darts"."ordinal" between 1 and 3),
	CONSTRAINT "darts_segment_range" CHECK ("darts"."segment" between 0 and 25),
	CONSTRAINT "darts_multiplier_range" CHECK ("darts"."multiplier" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid,
	"mode" text NOT NULL,
	"status" "match_status" DEFAULT 'pending' NOT NULL,
	"options" jsonb NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"winner_player_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "matches_state_version_nonnegative" CHECK ("matches"."state_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid,
	"seat" integer NOT NULL,
	"display_name" text NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"bot_level" integer,
	CONSTRAINT "players_seat_nonnegative" CHECK ("players"."seat" >= 0),
	CONSTRAINT "players_bot_level_range" CHECK ("players"."bot_level" is null or ("players"."bot_level" between 1 and 20))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "room_member_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_members_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"turn_number" integer NOT NULL,
	"score_before" integer NOT NULL,
	"score_after" integer NOT NULL,
	"bust" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"stripe_event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "darts" ADD CONSTRAINT "darts_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "darts_turn_ordinal_uq" ON "darts" USING btree ("turn_id","ordinal");--> statement-breakpoint
CREATE INDEX "matches_room_idx" ON "matches" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "players_match_seat_uq" ON "players" USING btree ("match_id","seat");--> statement-breakpoint
CREATE INDEX "players_user_idx" ON "players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "room_members_user_idx" ON "room_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_uq" ON "rooms" USING btree ("code");--> statement-breakpoint
CREATE INDEX "rooms_owner_idx" ON "rooms" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_customer_uq" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_uq" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turns_match_number_uq" ON "turns" USING btree ("match_id","turn_number");--> statement-breakpoint
CREATE INDEX "turns_player_idx" ON "turns" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_subject_uq" ON "users" USING btree ("auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "webhook_events_processed_idx" ON "webhook_events" USING btree ("processed_at");