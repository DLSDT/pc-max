import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { optimizationPackageVersions, optimizationPackages, packageFiles } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';

/** Validate a destination path: relative, inside the game directory only. */
export function assertSafeDestination(destination: string): void {
  if (destination.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(destination)) {
    throw badRequest('Destination must be relative to the game directory');
  }
  const normalized = destination.split(/[\\/]/);
  if (normalized.some((part) => part === '..' || part === '')) {
    throw badRequest('Destination may not contain empty or parent (..) path segments');
  }
  if (destination.includes('\\')) {
    throw badRequest('Use forward slashes in destination paths');
  }
}

/** Safe extension allowlist — packages can never contain executables/scripts. */
const BLOCKED_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf',
  'sh', 'bash', 'zsh', 'csh', 'reg', 'msi', 'dll64', 'sys', 'drv',
]);

export function assertSafeFilename(filename: string): void {
  if (filename.includes('\\') || filename.startsWith('/') || filename.includes('..')) {
    throw badRequest('Invalid filename');
  }
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (BLOCKED_EXT.has(ext)) {
    throw badRequest(`File type .${ext} is not allowed in optimization packages`);
  }
}

/** Load a package by slug within a game (soft-delete aware). */
export async function findPackageBySlug(gameId: string, slug: string) {
  return db.query.optimizationPackages.findFirst({
    where: and(eq(optimizationPackages.gameId, gameId), eq(optimizationPackages.slug, slug), isNull(optimizationPackages.deletedAt)),
  });
}

/** Load a package by id (soft-delete aware). */
export async function findPackageById(id: string) {
  return db.query.optimizationPackages.findFirst({
    where: and(eq(optimizationPackages.id, id), isNull(optimizationPackages.deletedAt)),
  });
}

/**
 * Current manifest rows for a package.
 *
 * Rows are ordered newest-first, then deduped by destination: when a new
 * version re-uploads a file, the previous row is superseded. The version
 * snapshots in `optimization_package_versions` keep the full history for
 * restore/audit — the live manifest always reflects the latest upload, so the
 * installer never sees duplicate destinations or stale hashes.
 */
export async function listPackageFiles(packageId: string) {
  const rows = await db
    .select()
    .from(packageFiles)
    .where(eq(packageFiles.packageId, packageId))
    .orderBy(desc(packageFiles.sortOrder), desc(packageFiles.createdAt));
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.destination)) return false;
    seen.add(r.destination);
    return true;
  });
}

function bumpPatch(version: string): string {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '1.0.1';
  return `${parts[0]}.${parts[1]}.${(parts[2] ?? 0) + 1}`;
}

/** Publish a package: snapshots the manifest, bumps semver, marks published. */
export async function publishPackage(packageId: string, changeNote: string | undefined, adminId: string) {
  const pkg = await findPackageById(packageId);
  if (!pkg) throw notFound('Optimization package');

  const files = await listPackageFiles(packageId);
  if (files.length === 0) throw badRequest('Cannot publish a package with no files');

  const snapshot = files.map((f) => ({
    filename: f.filename,
    sha256: f.sha256,
    size: f.size,
    destination: f.destination,
    operation: f.operation,
    sortOrder: f.sortOrder,
  }));

  const nextVersion = bumpPatch(pkg.version);

  return db.transaction(async (tx) => {
    await tx.insert(optimizationPackageVersions).values({
      packageId: pkg.id,
      version: nextVersion,
      changeNote: changeNote ?? null,
      files: snapshot,
      createdBy: adminId,
    });
    const [updated] = await tx
      .update(optimizationPackages)
      .set({ version: nextVersion, status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(optimizationPackages.id, pkg.id))
      .returning();
    return updated!;
  });
}

/** Public package payload shape. */
export function toPackagePublic(pkg: typeof optimizationPackages.$inferSelect) {
  return {
    id: pkg.id,
    gameId: pkg.gameId,
    name: pkg.name,
    slug: pkg.slug,
    description: pkg.description,
    version: pkg.version,
    status: pkg.status,
    kind: pkg.kind,
    gpuVendor: pkg.gpuVendor,
    gpuFamily: pkg.gpuFamily,
    minVramMb: pkg.minVramMb,
    minRamGb: pkg.minRamGb,
    minWindows: pkg.minWindows,
    gameVersion: pkg.gameVersion,
    arch: pkg.arch,
    targetResolution: pkg.targetResolution,
    targetFps: pkg.targetFps,
    isDefault: pkg.isDefault,
    publishedAt: pkg.publishedAt ? pkg.publishedAt.toISOString() : null,
  };
}

export { optimizationPackageVersions };
