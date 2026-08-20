CREATE TYPE "public"."package_kind" AS ENUM('graphics', 'frame_generation');--> statement-breakpoint
ALTER TABLE "optimization_packages" ADD COLUMN "kind" "package_kind" DEFAULT 'graphics' NOT NULL;
