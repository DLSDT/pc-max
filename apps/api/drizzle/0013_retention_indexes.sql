-- The daily retention job deletes by each table's age column. Without an index
-- on that column every run is a full table scan — invisible today (a few dozen
-- rows) but these are exactly the tables that grow per-user, so at ~10k users
-- the nightly cleanup would start scanning millions of rows against live
-- traffic. views/audit_logs/client_errors already had theirs.
CREATE INDEX IF NOT EXISTS "otp_codes_created_idx" ON "otp_codes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_resets_created_idx" ON "password_resets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_attempts_attempted_idx" ON "login_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_expires_idx" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_logs_created_idx" ON "email_logs" USING btree ("created_at");
