import { z } from 'zod';
import { PackagePublic } from './package';

/** Hardware snapshot submitted by the desktop app after detection. */
export const HardwareProfileInput = z.object({
  cpu: z.string().trim().max(200).optional(),
  gpuVendor: z.enum(['nvidia', 'amd', 'intel', 'unknown']).optional(),
  gpuModel: z.string().trim().max(300).optional(),
  vramMb: z.number().int().min(0).max(64 * 1024).optional(),
  ramGb: z.number().int().min(1).max(2048).optional(),
  windowsVersion: z.string().trim().max(100).optional(),
  arch: z.string().trim().max(20).optional(),
  resolution: z.string().trim().max(30).optional(),
  driverVersion: z.string().trim().max(100).optional(),
});
export type HardwareProfileInput = z.infer<typeof HardwareProfileInput>;

/** Stored hardware snapshot — nullable fields (some may not be detectable). */
export const HardwareProfilePublic = z.object({
  cpu: z.string().nullable(),
  gpuVendor: z.enum(['nvidia', 'amd', 'intel', 'unknown']).nullable(),
  gpuModel: z.string().nullable(),
  vramMb: z.number().int().nullable(),
  ramGb: z.number().int().nullable(),
  windowsVersion: z.string().nullable(),
  arch: z.string().nullable(),
  resolution: z.string().nullable(),
  driverVersion: z.string().nullable(),
  detectedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type HardwareProfilePublic = z.infer<typeof HardwareProfilePublic>;

/** Ask the compatibility engine for the best package for a game + hardware. */
export const HardwareRecommendInput = z.object({
  gameSlug: z.string().trim().min(1),
  hardware: HardwareProfileInput,
});
export type HardwareRecommendInput = z.infer<typeof HardwareRecommendInput>;

export const HardwareRecommendResponse = z.object({
  gameSlug: z.string(),
  recommended: PackagePublic.nullable(),
  alternatives: z.array(PackagePublic),
  reasons: z.array(z.string()),
});
export type HardwareRecommendResponse = z.infer<typeof HardwareRecommendResponse>;
