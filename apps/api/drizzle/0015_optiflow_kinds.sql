-- Two new package kinds for the split Multi-Frame Generation section:
--   optiflow   — Streamline/DLSS-G component swap + launcher-side unlocker
--   optiscaler — the OptiScaler drop-in and its per-vendor order profiles
-- ADD VALUE is additive and a new value cannot be *used* in the transaction
-- that created it, so this migration only declares them. Nothing here reads
-- them back; the columns that will hold them already exist.
ALTER TYPE "public"."package_kind" ADD VALUE IF NOT EXISTS 'optiflow';--> statement-breakpoint
ALTER TYPE "public"."package_kind" ADD VALUE IF NOT EXISTS 'optiscaler';
