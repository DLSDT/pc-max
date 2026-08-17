CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."app_channel" AS ENUM('stable', 'beta');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."hardware_tier" AS ENUM('low_end', 'mid_range', 'high_end', 'ultra');--> statement-breakpoint
CREATE TYPE "public"."image_type" AS ENUM('cover', 'background', 'logo', 'screenshot');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."requirement_tier" AS ENUM('minimum', 'recommended');--> statement-breakpoint
CREATE TYPE "public"."setting_type" AS ENUM('select', 'boolean', 'slider', 'text');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'viewer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"platform" text DEFAULT 'windows' NOT NULL,
	"channel" "app_channel" DEFAULT 'stable' NOT NULL,
	"release_notes" text,
	"download_url" text NOT NULL,
	"checksum_sha256" text,
	"min_app_version" text,
	"is_latest" boolean DEFAULT false NOT NULL,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_categories" (
	"game_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "game_categories_game_id_category_id_pk" PRIMARY KEY("game_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "game_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"type" "image_type" NOT NULL,
	"url" text NOT NULL,
	"object_key" text,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_requirements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"tier" "requirement_tier" NOT NULL,
	"os" text NOT NULL,
	"cpu" text NOT NULL,
	"gpu" text NOT NULL,
	"ram_gb" integer NOT NULL,
	"storage_gb" integer NOT NULL,
	"directx" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_tags" (
	"game_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "game_tags_game_id_tag_id_pk" PRIMARY KEY("game_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"description" text,
	"developer" text,
	"publisher" text,
	"release_date" timestamp with time zone,
	"engine" text,
	"api" text,
	"technologies" jsonb NOT NULL,
	"performance_rating" integer DEFAULT 50 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"status" "game_status" DEFAULT 'draft' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "games_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "optimization_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "optimization_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "optimization_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"setting_id" uuid NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_profile_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" text NOT NULL,
	"change_note" text,
	"data" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_fps" integer,
	"hardware_tier" "hardware_tier" DEFAULT 'mid_range' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"status" "profile_status" DEFAULT 'draft' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "optimization_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"category_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" "setting_type" DEFAULT 'select' NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"platform" text DEFAULT 'windows' NOT NULL,
	"app_version" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "views" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"game_id" uuid,
	"profile_id" uuid,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_categories" ADD CONSTRAINT "game_categories_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_categories" ADD CONSTRAINT "game_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_images" ADD CONSTRAINT "game_images_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_requirements" ADD CONSTRAINT "game_requirements_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_tags" ADD CONSTRAINT "game_tags_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_tags" ADD CONSTRAINT "game_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_options" ADD CONSTRAINT "optimization_options_setting_id_optimization_settings_id_fk" FOREIGN KEY ("setting_id") REFERENCES "public"."optimization_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_profile_versions" ADD CONSTRAINT "optimization_profile_versions_profile_id_optimization_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."optimization_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_profile_versions" ADD CONSTRAINT "optimization_profile_versions_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_profiles" ADD CONSTRAINT "optimization_profiles_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_settings" ADD CONSTRAINT "optimization_settings_profile_id_optimization_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."optimization_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_settings" ADD CONSTRAINT "optimization_settings_category_id_optimization_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."optimization_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_profile_id_optimization_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."optimization_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_versions_platform_channel_version_idx" ON "app_versions" USING btree ("platform","channel","version");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_game_idx" ON "favorites" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "game_images_game_idx" ON "game_images" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_requirements_game_tier_idx" ON "game_requirements" USING btree ("game_id","tier");--> statement-breakpoint
CREATE INDEX "games_status_view_idx" ON "games" USING btree ("status","view_count");--> statement-breakpoint
CREATE INDEX "games_featured_idx" ON "games" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "optimization_options_setting_idx" ON "optimization_options" USING btree ("setting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "optimization_options_setting_value_idx" ON "optimization_options" USING btree ("setting_id","value");--> statement-breakpoint
CREATE INDEX "optimization_profile_versions_profile_idx" ON "optimization_profile_versions" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "optimization_profiles_game_slug_idx" ON "optimization_profiles" USING btree ("game_id","slug");--> statement-breakpoint
CREATE INDEX "optimization_settings_profile_idx" ON "optimization_settings" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "sessions_admin_idx" ON "sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "views_game_viewed_idx" ON "views" USING btree ("game_id","viewed_at");--> statement-breakpoint
CREATE INDEX "views_viewed_idx" ON "views" USING btree ("viewed_at");