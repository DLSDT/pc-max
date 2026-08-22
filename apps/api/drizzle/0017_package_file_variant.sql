-- OptiScaler ships one base drop-in plus several mutually-exclusive "order"
-- profiles that differ only in OptiScaler.ini (NVIDIA/AMD/XESS × P1/P2). They
-- are one package, not six: the user picks a profile at install time and gets
-- the base files plus that profile's overrides.
--
--   variant IS NULL  — always installed (the base drop-in)
--   variant = '...'  — installed only when the user selects that profile
--
-- Existing rows are all base files, which is what NULL already means for them.
ALTER TABLE "package_files" ADD COLUMN IF NOT EXISTS "variant" text;--> statement-breakpoint

-- Listing a package's files now groups by variant, and resolving one profile
-- filters on it.
CREATE INDEX IF NOT EXISTS "package_files_package_variant_idx"
  ON "package_files" ("package_id", "variant");
