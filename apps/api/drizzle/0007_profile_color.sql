CREATE TYPE "public"."profile_color" AS ENUM('yellow', 'green');--> statement-breakpoint
ALTER TABLE "optimization_profiles" ADD COLUMN "color_profile" "profile_color";
