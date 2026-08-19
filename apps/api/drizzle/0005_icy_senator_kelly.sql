CREATE TYPE "public"."profile_color" AS ENUM('yellow', 'green');--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"recipient_hash" text NOT NULL,
	"masked_recipient" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"provider_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "otp_codes" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "executables" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "steam_app_id" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "epic_app_id" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "launcher" text;--> statement-breakpoint
ALTER TABLE "optimization_profiles" ADD COLUMN "color_profile" "profile_color";--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "otp_codes_email_purpose_idx" ON "otp_codes" USING btree ("email","purpose");