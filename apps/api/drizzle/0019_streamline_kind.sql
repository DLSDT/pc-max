-- Multi-Frame Generation gains a third tool alongside OptiScaler and AI
-- Optical Flow. ADD VALUE cannot be used in the transaction that creates it,
-- so it stands alone.
ALTER TYPE "public"."package_kind" ADD VALUE IF NOT EXISTS 'streamline';
