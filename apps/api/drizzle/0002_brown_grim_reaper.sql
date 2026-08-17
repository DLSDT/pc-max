CREATE TYPE "public"."file_operation" AS ENUM('replace', 'add');--> statement-breakpoint
CREATE TYPE "public"."package_arch" AS ENUM('any', 'x64', 'arm64');--> statement-breakpoint
CREATE TYPE "public"."package_gpu_vendor" AS ENUM('any', 'nvidia', 'amd', 'intel');--> statement-breakpoint
CREATE TABLE "hardware_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"cpu" text,
	"gpu_vendor" text,
	"gpu_model" text,
	"vram_mb" integer,
	"ram_gb" integer,
	"windows_version" text,
	"arch" text,
	"resolution" text,
	"driver_version" text,
	"detected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hardware_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "optimization_package_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"package_id" uuid NOT NULL,
	"version" text NOT NULL,
	"change_note" text,
	"files" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_packages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"status" "profile_status" DEFAULT 'draft' NOT NULL,
	"gpu_vendor" "package_gpu_vendor" DEFAULT 'any' NOT NULL,
	"gpu_family" text,
	"min_vram_mb" integer,
	"min_ram_gb" integer,
	"min_windows" text,
	"game_version" text,
	"arch" "package_arch" DEFAULT 'any' NOT NULL,
	"target_resolution" text,
	"target_fps" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "package_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"package_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"destination" text NOT NULL,
	"operation" "file_operation" DEFAULT 'replace' NOT NULL,
	"storage_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hardware_profiles" ADD CONSTRAINT "hardware_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_package_versions" ADD CONSTRAINT "optimization_package_versions_package_id_optimization_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."optimization_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_package_versions" ADD CONSTRAINT "optimization_package_versions_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_packages" ADD CONSTRAINT "optimization_packages_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_files" ADD CONSTRAINT "package_files_package_id_optimization_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."optimization_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "optimization_package_versions_package_idx" ON "optimization_package_versions" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "optimization_packages_game_slug_idx" ON "optimization_packages" USING btree ("game_id","slug");--> statement-breakpoint
CREATE INDEX "optimization_packages_game_status_idx" ON "optimization_packages" USING btree ("game_id","status");--> statement-breakpoint
CREATE INDEX "package_files_package_idx" ON "package_files" USING btree ("package_id");