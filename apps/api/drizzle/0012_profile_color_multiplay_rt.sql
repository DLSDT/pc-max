-- The Optimized Setting source files contain two more block types beyond
-- Yellow/Green: OPTIMISED-SETTINGS-MULTIPLAY (a competitive/low-latency
-- preset) and RAY TRACING-OPTIMISED-SETTINGS (an opt-in add-on). Both were
-- being merged into the neighbouring profile, producing duplicate setting
-- names with contradictory values. They need their own profile rows.
ALTER TYPE "public"."profile_color" ADD VALUE IF NOT EXISTS 'multiplay';
--> statement-breakpoint
ALTER TYPE "public"."profile_color" ADD VALUE IF NOT EXISTS 'ray_tracing';
