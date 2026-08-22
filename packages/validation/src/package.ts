import { z } from 'zod';

/** GPU vendor a package targets (or is compatible with). */
export const PackageGpuVendor = z.enum(['any', 'nvidia', 'amd', 'intel']);
export type PackageGpuVendor = z.infer<typeof PackageGpuVendor>;

export const PackageArch = z.enum(['any', 'x64', 'arm64']);
export type PackageArch = z.infer<typeof PackageArch>;

/** Which product area a package belongs to — Optimized Setting (graphics
 *  config files) vs Multi-Frame Generation (upscaler/frame-gen components). */
export const PackageKind = z.enum(['graphics', 'frame_generation', 'upscaler', 'optiflow', 'optiscaler']);
export type PackageKind = z.infer<typeof PackageKind>;

/** The two tools the Multi-Frame Generation section splits into. Each is
 *  backed by exactly one published global package of the matching kind. */
export const MfgTool = z.enum(['optiflow', 'optiscaler']);
export type MfgTool = z.infer<typeof MfgTool>;

/**
 * Where a package file ends up.
 *
 * `relative` is every package written before OptiFlow existed: the destination
 * is a path under the game directory and that is the whole story. The other
 * two exist because OptiFlow's destinations are not knowable until the user
 * picks their game:
 *
 * - `streamline` — the file replaces the same-named file *wherever it already
 *   is* in the install. It is never created; if the game does not ship that
 *   component there is nothing to swap and the entry is reported as missing.
 * - `launcher` — the file is dropped beside the executable the user selected.
 *
 * The client resolves these against a real directory, so the resolution is the
 * security boundary — see `optiflow_scan` in the Tauri layer.
 */
export const PackageFileRole = z.enum(['relative', 'streamline', 'launcher']);
export type PackageFileRole = z.infer<typeof PackageFileRole>;

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
  role: PackageFileRole.default('relative'),
  /** Omit for a base file. Set to install this file only when the user picks
   *  that profile — see `PackageFilePublic.variant`. */
  variant: z.string().trim().min(1).max(60).optional(),
});
export type PackageFileCompleteInput = z.infer<typeof PackageFileCompleteInput>;

/** Public package metadata shown in the desktop storefront. */
export const PackagePublic = z.object({
  id: z.string().uuid(),
  /** Null for a global package — one that is not tied to a single game. */
  gameId: z.string().uuid().nullable(),
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
  role: PackageFileRole,
  /** Null for a base file that every install gets. Otherwise the profile this
   *  file belongs to; exactly one profile is installed at a time. */
  variant: z.string().nullable(),
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
      role: PackageFileRole,
      variant: z.string().nullable(),
      url: z.string(),
      /** URL validity window in seconds — the client should fetch promptly. */
      expiresIn: z.number().int(),
    }),
  ),
});
export type PackageDownloadResponse = z.infer<typeof PackageDownloadResponse>;

export const PackageListResponse = z.object({ data: z.array(PackagePublic) });
export type PackageListResponse = z.infer<typeof PackageListResponse>;

/**
 * The published package behind one Multi-Frame Generation tool, with signed
 * per-file URLs. Same entitlement gate as the per-game download.
 */
export const MfgToolPackageResponse = z.object({
  tool: MfgTool,
  package: PackagePublic,
  files: z.array(
    z.object({
      filename: z.string(),
      sha256: z.string(),
      size: z.number().int(),
      destination: z.string(),
      operation: FileOperation,
      role: PackageFileRole,
      variant: z.string().nullable(),
      url: z.string(),
      expiresIn: z.number().int(),
    }),
  ),
});
export type MfgToolPackageResponse = z.infer<typeof MfgToolPackageResponse>;

/** Availability probe — lets the page say "not published yet" without needing
 *  a subscription first, so an empty admin panel does not look like a paywall. */
export const MfgToolStatusResponse = z.object({
  tool: MfgTool,
  available: z.boolean(),
  package: PackagePublic.nullable(),
  /** Manifest without URLs, so the page can list what it is about to touch. */
  manifest: z.array(PackageFilePublic),
  /** Selectable profiles, in upload order. Empty when the package has no
   *  variants — then there is nothing to choose and the base is the install. */
  variants: z.array(z.string()),
});
export type MfgToolStatusResponse = z.infer<typeof MfgToolStatusResponse>;
