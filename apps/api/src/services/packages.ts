import { and, desc, eq, isNull } from 'drizzle-orm';
import type { PackageFileRole } from '@goh/validation';
import { db } from '../db';
import { optimizationPackageVersions, optimizationPackages, packageFiles } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';

/**
 * Extensions a package file may have — the single source of truth for both the
 * upload gate and the destination gate.
 *
 * Must stay in step with ALLOWED_EXT in apps/desktop/src-tauri/src/lib.rs,
 * which is what actually decides whether a client will write the file. An
 * extension the server accepts but the client does not means a package that
 * publishes cleanly and then silently fails to install on every machine;
 * `packageExtensions.test.ts` asserts the two lists match.
 */
export const PACKAGE_EXT = new Set([
  'cfg', 'ini', 'txt', 'json', 'xml', 'toml', 'preset', 'pak', 'bin', 'dat', 'dll', 'fx',
  'nvpreset', 'sig', 'profile', 'settings', 'upd', 'blend', 'lut', 'csv', 'yml', 'yaml', 'log',
]);

/**
 * Explicitly refused extensions, checked before the allowlist purely so the
 * error names the problem ("`.exe` is not allowed") instead of the generic
 * "unsupported file type".
 */
const BLOCKED_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf',
  'sh', 'bash', 'zsh', 'csh', 'reg', 'msi', 'dll64', 'sys', 'drv',
]);

function assertAllowedExtension(name: string, label: string): void {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (BLOCKED_EXT.has(ext)) {
    throw badRequest(`File type .${ext} is not allowed in optimization packages`);
  }
  if (!PACKAGE_EXT.has(ext)) {
    throw badRequest(`${label} has an unsupported file type (.${ext})`);
  }
}

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
  // The destination is what the desktop actually writes, and it was never
  // extension-checked here — so a package could be published with
  // destination "payload.exe" and then be refused by every client at install
  // time, with the failure surfacing on users' machines instead of at
  // authoring time.
  assertAllowedExtension(destination, 'Destination');
}

/**
 * Validate a destination for a role whose directory is decided on the user's
 * machine, not here.
 *
 * A `streamline` or `launcher` file has no path — the installer finds the
 * directory (the existing component's location, or the launcher's folder) and
 * the destination is only the name to write there. Accepting a path would mean
 * publishing a package whose path half is silently ignored at install time, so
 * anything with a separator is refused at authoring time instead.
 */
export function assertSafeRoleDestination(destination: string, role: PackageFileRole): void {
  if (role === 'relative') {
    assertSafeDestination(destination);
    return;
  }
  if (/[\\/]/.test(destination)) {
    throw badRequest(
      `A ${role} file's destination is just a filename — the installer decides the directory`,
    );
  }
  if (destination === '.' || destination === '..' || destination.startsWith('.')) {
    throw badRequest('Invalid destination');
  }
  assertAllowedExtension(destination, 'Destination');
}

export function assertSafeFilename(filename: string): void {
  if (filename.includes('\\') || filename.startsWith('/') || filename.includes('..')) {
    throw badRequest('Invalid filename');
  }
  assertAllowedExtension(filename, 'Filename');
}

/** Load a package by slug within a game (soft-delete aware). */
export async function findPackageBySlug(gameId: string, slug: string) {
  return db.query.optimizationPackages.findFirst({
    where: and(eq(optimizationPackages.gameId, gameId), eq(optimizationPackages.slug, slug), isNull(optimizationPackages.deletedAt)),
  });
}

/** Load a global (game-less) package by slug. */
export async function findGlobalPackageBySlug(slug: string) {
  return db.query.optimizationPackages.findFirst({
    where: and(isNull(optimizationPackages.gameId), eq(optimizationPackages.slug, slug), isNull(optimizationPackages.deletedAt)),
  });
}

/**
 * The published global package behind an MFG tool.
 *
 * A tool is backed by at most one — publishing a second is an admin mistake
 * rather than a supported layout, so the newest published one wins and the
 * choice is deterministic instead of whatever the planner returns first.
 */
export async function findPublishedToolPackage(kind: 'optiflow' | 'optiscaler') {
  return db.query.optimizationPackages.findFirst({
    where: and(
      isNull(optimizationPackages.gameId),
      eq(optimizationPackages.kind, kind),
      eq(optimizationPackages.status, 'published'),
      isNull(optimizationPackages.deletedAt),
    ),
    orderBy: [desc(optimizationPackages.publishedAt)],
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
    // Keyed by variant AND destination. Deduping on destination alone would
    // silently discard five of OptiScaler's six profiles, since every one of
    // them supplies its own OptiScaler.ini — the newest upload would win and
    // the rest would vanish from the manifest.
    const key = `${r.variant ?? ''}\u0000${r.destination}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The selectable profiles in a package, in upload order.
 *
 * Order matters to the UI (the first is preselected), and `sortOrder`/createdAt
 * both descend in `listPackageFiles`, so this re-sorts ascending rather than
 * showing the newest upload first.
 */
export function packageVariants(files: { variant: string | null; sortOrder: number; createdAt: Date }[]): string[] {
  const seen = new Map<string, { sortOrder: number; createdAt: Date }>();
  for (const f of files) {
    if (!f.variant) continue;
    const prev = seen.get(f.variant);
    if (!prev || f.createdAt < prev.createdAt) seen.set(f.variant, { sortOrder: f.sortOrder, createdAt: f.createdAt });
  }
  return [...seen.entries()]
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder || a[1].createdAt.getTime() - b[1].createdAt.getTime())
    .map(([name]) => name);
}

/**
 * The files one install actually writes: every base file, plus the selected
 * profile's files.
 *
 * A package with profiles and no selection resolves to the base alone, which
 * for OptiScaler means the drop-in without a config — so callers ask for a
 * variant explicitly and the route rejects an unknown one rather than quietly
 * installing a half-package.
 */
export function resolveVariantFiles<T extends { variant: string | null }>(files: T[], variant: string | null): T[] {
  return files.filter((f) => f.variant === null || f.variant === variant);
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
    role: f.role,
    variant: f.variant,
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
