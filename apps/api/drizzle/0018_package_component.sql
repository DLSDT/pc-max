-- OptiScaler ships three distinct classes of content that all live in one
-- package: the installer drop-in itself, the selectable Plans, and the
-- selectable Orders. `variant` already names WHICH one of a set a file belongs
-- to; this says WHAT KIND of thing that set is, so the installer can apply
-- "installer + one plan + one order" and the UI can list the three groups
-- separately.
--
--   installer  the drop-in binaries. variant NULL = always installed;
--              a named variant = a selectable installer build.
--   plan       one selectable Plan.
--   order      one selectable Order.
--
-- Every existing row is installer content, which is what NULL meant for them.
DO $$ BEGIN
  CREATE TYPE "public"."package_component" AS ENUM('installer', 'plan', 'order');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

ALTER TABLE "package_files"
  ADD COLUMN IF NOT EXISTS "component" "public"."package_component" NOT NULL DEFAULT 'installer';--> statement-breakpoint

-- Listing a package now groups by (component, variant); resolving an install
-- filters on both.
CREATE INDEX IF NOT EXISTS "package_files_package_component_variant_idx"
  ON "package_files" ("package_id", "component", "variant");
