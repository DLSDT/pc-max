-- OptiFlow installs files whose destination is not known until the user picks
-- their game, so `destination` alone cannot describe them:
--
--   relative   — existing behaviour: <game dir>/<destination>
--   streamline — replace the file of the same name wherever it already exists
--                inside the game directory (the SL/nvngx component swap)
--   launcher   — drop next to the selected executable (the unlocker)
--
-- Existing rows are 'relative', which is exactly what they have always been.
DO $$ BEGIN
  CREATE TYPE "public"."package_file_role" AS ENUM('relative', 'streamline', 'launcher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

ALTER TABLE "package_files"
  ADD COLUMN IF NOT EXISTS "role" "public"."package_file_role" NOT NULL DEFAULT 'relative';--> statement-breakpoint

-- OptiFlow/OptiScaler payloads are the same files for every game, so a package
-- may now be global. Per-game packages keep working unchanged.
ALTER TABLE "optimization_packages" ALTER COLUMN "game_id" DROP NOT NULL;--> statement-breakpoint

-- The old unique index is (game_id, slug). Postgres treats NULLs as distinct,
-- so it would let two global packages share a slug — this partial index closes
-- that hole without touching the per-game one.
CREATE UNIQUE INDEX IF NOT EXISTS "optimization_packages_global_slug_idx"
  ON "optimization_packages" ("slug") WHERE "game_id" IS NULL;--> statement-breakpoint

-- Looking up "the published OptiFlow package" is a kind+status scan with no
-- game to narrow it, so it needs its own index.
CREATE INDEX IF NOT EXISTS "optimization_packages_kind_status_idx"
  ON "optimization_packages" ("kind", "status");
