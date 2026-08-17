CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"recipient_hash" text NOT NULL,
	"masked_recipient" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"provider_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "email_logs_event_created_idx" ON "email_logs" USING btree ("event","created_at");--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "executables" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "steam_app_id" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "epic_app_id" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "launcher" text;
