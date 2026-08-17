ALTER TABLE "otp_codes" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "otp_codes_email_purpose_idx" ON "otp_codes" USING btree ("email","purpose");
