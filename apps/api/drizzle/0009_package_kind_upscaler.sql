-- Add 'upscaler' as a third package kind (DLSS/FSR/XeSS upscaler DLL drops),
-- alongside 'graphics' and 'frame_generation'. ADD VALUE is additive and
-- cannot be rolled back inside a transaction, so it stands alone.
ALTER TYPE "public"."package_kind" ADD VALUE IF NOT EXISTS 'upscaler';
