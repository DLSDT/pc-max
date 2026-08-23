-- AI Optical Flow selects along two axes of its own: which Unlocker build and
-- which Streamline package. They are the same idea as OptiScaler's
-- installer/plan/order — "what kind of set does this variant belong to" — so
-- they extend the existing component enum rather than adding a parallel one.
--
-- ADD VALUE cannot be used in the transaction that creates it, so these stand
-- alone and nothing here reads them back.
ALTER TYPE "public"."package_component" ADD VALUE IF NOT EXISTS 'unlocker';--> statement-breakpoint
ALTER TYPE "public"."package_component" ADD VALUE IF NOT EXISTS 'streamline';
