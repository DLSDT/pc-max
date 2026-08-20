import { z } from 'zod';

/** GPU vendor a package targets (or is compatible with). */
export const PackageGpuVendor = z.enum(['any', 'nvidia', 'amd', 'intel']);
export type PackageGpuVendor = z.infer<typeof PackageGpuVendor>;

export const PackageArch = z.enum(['any', 'x64', 'arm64']);
export type PackageArch = z.infer<typeof PackageArch>;

/** Which product area a package belongs to — Optimized Setting (graphics
 *  config files) vs Multi-Frame Generation (upscaler/frame-gen components). */
export const PackageKind = z.enum(['graphics', 'frame_generation', 'upscaler']);
export type PackageKind = z.infer<typeof PackageKind>;

/** Allowed file operations — packages can only replace or add files, never
 *  execute anything. This is the allowlist that prevents arbitrary RCE. */
export const FileOperation = z.enum(['replace', 'add']);
export type FileOperation = z.infer<typeof FileOperation>;

/** Create a package (admin). All compatibility fields are dynamic. */
export const OptimizationPackageInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, digits and dashes'),
  description: z.string().trim().max(2000).optional(),
  kind: PackageKind.default('graphics'),
  gpuVendor: PackageGpuVendor.default('any'),
  gpuFamily: z.string().trim().max(120).optional(),
  minVramMb: z.number().int().min(0).max(64 * 1024).optional(),
  minRamGb: z.number().int().min(0).max(2048).optional(),
  minWindows: z.string().trim().max(50).optional(),
  gameVersion: z.string().trim().max(50).optional(),
  arch: PackageArch.default('any'),
  targetResolution: z.string().trim().max(50).optional(),
  targetFps: z.number().int().min(0).max(1000).optional(),
  isDefault: z.boolean().default(false),
});
export type OptimizationPackageInput = z.infer<typeof OptimizationPackageInput>;

export const OptimizationPackageUpdateInput = OptimizationPackageInput.partial();
export type OptimizationPackageUpdateInput = z.infer<typeof OptimizationPackageUpdateInput>;

/** Publish a package — bumps the semver and snapshots the manifest. */
export const PackagePublishInput = z.object({
  changeNote: z.string().trim().max(2000).optional(),
});
export type PackagePublishInput = z.infer<typeof PackagePublishInput>;

/** Request a presigned upload URL for a package file. */
export const PackagePresignInput = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(500 * 1024 * 1024),
});
export type PackagePresignInput = z.infer<typeof PackagePresignInput>;

/** Finalize an uploaded file — the server verifies the stored object and
 *  computes its SHA-256 before it enters the manifest. */
export const PackageFileCompleteInput = z.object({
  storageKey: z.string().trim().min(1).max(500),
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(500 * 1024 * 1024),
  /** Relative destination inside the game directory. */
  destination: z.string().trim().min(1).max(500),
  operation: FileOperation.default('replace'),
});
export type PackageFileCompleteInput = z.infer<typeof PackageFileCompleteInput>;

/** Public package metadata shown in the desktop storefront. */
export const PackagePublic = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  version: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
  kind: PackageKind,
  gpuVendor: PackageGpuVendor,
  gpuFamily: z.string().nullable(),
  minVramMb: z.number().int().nullable(),
  minRamGb: z.number().int().nullable(),
  minWindows: z.string().nullable(),
  gameVersion: z.string().nullable(),
  arch: PackageArch,
  targetResolution: z.string().nullable(),
  targetFps: z.number().int().nullable(),
  isDefault: z.boolean(),
  publishedAt: z.string().nullable(),
});
export type PackagePublic = z.infer<typeof PackagePublic>;

/** Manifest entry — hash, size and destination for one file. */
export const PackageFilePublic = z.object({
  filename: z.string(),
  sha256: z.string(),
  size: z.number().int(),
  destination: z.string(),
  operation: FileOperation,
  sortOrder: z.number().int(),
});
export type PackageFilePublic = z.infer<typeof PackageFilePublic>;

/** Entitlement-gated download response: manifest + per-file URLs. */
export const PackageDownloadResponse = z.object({
  package: PackagePublic,
  files: z.array(
    z.object({
      filename: z.string(),
      sha256: z.string(),
      size: z.number().int(),
      destination: z.string(),
      operation: FileOperation,
      url: z.string(),
      /** URL validity window in seconds — the client should fetch promptly. */
      expiresIn: z.number().int(),
    }),
  ),
});
export type PackageDownloadResponse = z.infer<typeof PackageDownloadResponse>;

export const PackageListResponse = z.object({ data: z.array(PackagePublic) });
export type PackageListResponse = z.infer<typeof PackageListResponse>;
