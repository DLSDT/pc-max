CREATE TABLE IF NOT EXISTS "client_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"route" text,
	"app_version" text,
	"platform" text,
	"device_id" text,
	"source" text DEFAULT 'render' NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_errors_fingerprint_idx" ON "client_errors" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_errors_last_seen_idx" ON "client_errors" USING btree ("last_seen_at");
