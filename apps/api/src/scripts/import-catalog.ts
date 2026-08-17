/**
 * Game Catalog Importer — scans the brand icon pack (`icon/game icon/`) and
 * imports every game into the database, idempotently.
 *
 *   npm run catalog:import -w @goh/api            # default locations
 *   GOH_ICON_DIR=/path/to/icons node dist/scripts/import-catalog.js
 *
 * Guarantees:
 *   - Every folder becomes exactly one game (deterministic slug; folders are
 *     sorted first, then collisions get `-2`, `-3`, … suffixes in scan order).
 *   - Idempotent: re-running never duplicates rows (upsert by slug, profiles
 *     created only when missing).
 *   - Each game gets the default 4 optimization profiles + a converted
 *     256×256 PNG in `apps/desktop/public/game-icons/`, and
 *     `apps/desktop/src/lib/gameIcons.ts` is regenerated from the PNGs.
 *   - Prints a full validation summary; failures are reported, never silent.
 *
 * The database modules are imported dynamically so this script runs standalone
 * (the API config needs env vars; main() sets sensible dev defaults first).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ProfileSlug, SeedGame } from '../db/seed-data';

const ICON_EXTS = new Set(['.ico', '.png', '.jpg', '.jpeg', '.webp', '.bmp']);

export interface IconEntry {
  folder: string;
  slug: string;
  iconPath: string;
}

export interface ImportSummary {
  foldersFound: number;
  gamesImported: number;
  gamesAlreadyPresent: number;
  duplicatesResolved: number;
  missingIcons: { folder: string; reason: string }[];
  iconConversionFailed: { slug: string; error: string }[];
  databaseErrors: { slug: string; error: string }[];
  iconsWritten: number;
}

/** `Grand Theft Auto V` → `grand-theft-auto-v` (lowercase, alnum, single dashes). */
export function slugifyFolder(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'game';
}

/**
 * Deterministic slug assignment. Folders are sorted first (stable), then each
 * gets `slugifyFolder(name)`; on a collision the next free `-2`, `-3`, … suffix
 * is used so no two folders ever share a slug.
 */
export function resolveSlugs(folders: string[]): { slugs: Map<string, string>; duplicates: number } {
  // Input order is preserved: the first folder keeps the base slug and later
  // collisions get `-2`, `-3`, … suffixes. Callers that need determinism pass
  // a sorted list (scanIconDir does).
  const used = new Set<string>();
  const slugs = new Map<string, string>();
  let duplicates = 0;
  for (const folder of folders) {
    const base = slugifyFolder(folder);
    let slug = base;
    let n = 2;
    if (used.has(base)) duplicates += 1; // this folder collides with an earlier one
    while (used.has(slug)) {
      slug = `${base}-${n}`;
      n += 1;
    }
    used.add(slug);
    slugs.set(folder, slug);
  }
  return { slugs, duplicates };
}

/** Scan the icon pack: every subdirectory with at least one icon file. */
export function scanIconDir(iconDir: string): { entries: IconEntry[]; missingIcons: { folder: string; reason: string }[]; duplicates: number } {
  const entries: IconEntry[] = [];
  const folders: string[] = [];
  const missingIcons: { folder: string; reason: string }[] = [];

  for (const name of readdirSync(iconDir)) {
    const full = path.join(iconDir, name);
    if (!statSync(full).isDirectory()) continue; // stray files (logs etc.) are ignored
    if (name.startsWith('.') || name.toLowerCase() === 'desktop.ini') continue;
    folders.push(name);
  }

  // Sort before slug assignment so the result is deterministic regardless of
  // the OS-level readdir order.
  const { slugs, duplicates } = resolveSlugs([...folders].sort());

  for (const folder of folders) {
    const dir = path.join(iconDir, folder);
    const files = readdirSync(dir)
      .filter((f) => f.toLowerCase() !== 'desktop.ini')
      .sort();
    const icon = files.find((f) => ICON_EXTS.has(path.extname(f).toLowerCase()));
    const slug = slugs.get(folder)!;
    if (!icon) {
      missingIcons.push({ folder, reason: 'no icon file found in folder' });
      continue;
    }
    entries.push({ folder, slug, iconPath: path.join(dir, icon) });
  }

  return { entries, missingIcons, duplicates };
}

/** Convert icons to 256×256 PNGs in `outputDir` via the bundled Python helper. */
export function convertIcons(entries: IconEntry[], outputDir: string): { iconsWritten: number; failed: { slug: string; error: string }[] } {
  mkdirSync(outputDir, { recursive: true });
  const manifestPath = path.join(outputDir, '..', `.icon-manifest-${process.pid}.json`);
  writeFileSync(manifestPath, JSON.stringify(entries.map((e) => ({ slug: e.slug, path: e.iconPath }))), 'utf-8');
  const helper = path.join(__dirname, 'convert-icons.py');
  const stdout = execFileSync('python3', [helper, manifestPath, outputDir], { encoding: 'utf-8' });
  const result = JSON.parse(stdout) as { ok: number; failed: { slug: string; error: string }[] };
  try {
    // Best-effort cleanup of the temporary manifest.
    unlinkSync(manifestPath);
  } catch {
    /* non-fatal */
  }
  return { iconsWritten: result.ok, failed: result.failed };
}

/** Regenerate `gameIcons.ts` from whatever PNGs exist in the output dir. */
export function writeGameIconsModule(outputDir: string): string {
  const slugs = readdirSync(outputDir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.replace(/\.png$/, ''))
    .sort();
  const lines = [
    '/**',
    ' * Bundled game icons (real artwork supplied by the brand pack in /icon).',
    ' *',
    ' * GENERATED by apps/api/scripts/import-catalog.ts — do not edit by hand.',
    ' * Re-run the importer after adding icon folders to refresh this list.',
    ' */',
    'const ICON_SLUGS = new Set([',
    ...slugs.map((s) => `  '${s}',`),
    ']);',
    '',
    '/** Absolute icon URL for a game slug, or null when none is bundled. */',
    'export function gameIconUrl(slug: string): string | null {',
    '  return ICON_SLUGS.has(slug) ? `/game-icons/${slug}.png` : null;',
    '}',
    '',
  ];
  const content = lines.join('\n');
  const outFile = path.resolve(outputDir, '../../src/lib/gameIcons.ts');
  writeFileSync(outFile, content, 'utf-8');
  return outFile;
}

/** Ensure the default 4 optimization profiles exist for a game (idempotent). */
export async function ensureProfiles(gameId: string, slug: string): Promise<void> {
  const { db } = await import('../db');
  const { optimizationCategories, optimizationOptions, optimizationProfiles, optimizationSettings } = await import('../db/schema');
  const { PROFILE_SLUGS, PROFILES, settingsForGame } = await import('../db/seed-data');
  const { DEFAULT_TECHNOLOGIES } = await import('../services/games');
  const { eq } = await import('drizzle-orm');

  const existing = await db.query.optimizationProfiles.findFirst({ where: eq(optimizationProfiles.gameId, gameId) });
  if (existing) return;

  const catRows = await db.select({ id: optimizationCategories.id, slug: optimizationCategories.slug }).from(optimizationCategories);
  const optCatIdBySlug = new Map(catRows.map((c) => [c.slug, c.id]));
  const gameLike = { slug, name: slug, technologies: DEFAULT_TECHNOLOGIES } as unknown as SeedGame;

  for (const profileSlug of PROFILE_SLUGS) {
    const meta = PROFILES[profileSlug];
    const [profile] = await db
      .insert(optimizationProfiles)
      .values({
        gameId,
        slug: profileSlug,
        name: meta.name,
        description: meta.description,
        targetFps: meta.targetFps,
        hardwareTier: meta.tier,
        version: '1.0.0',
        status: 'published',
        isDefault: profileSlug === 'balanced',
        publishedAt: new Date(),
      })
      .returning();
    const profileRow = profile!;

    for (const [settingIndex, def] of settingsForGame(gameLike).entries()) {
      const [setting] = await db
        .insert(optimizationSettings)
        .values({
          profileId: profileRow.id,
          categoryId: optCatIdBySlug.get(def.category) ?? null,
          key: def.key,
          name: def.name,
          type: 'select',
          value: def.values[profileSlug as ProfileSlug],
          sortOrder: settingIndex,
        })
        .returning();
      const settingRow = setting!;

      const recommendedValue = def.values.balanced;
      await db.insert(optimizationOptions).values(
        def.options.map((value, i) => ({
          settingId: settingRow.id,
          value,
          label: value,
          isRecommended: value === recommendedValue && profileSlug === 'balanced',
          sortOrder: i,
        })),
      );
    }
  }
}

export interface ImportOptions {
  iconDir?: string;
  outputDir?: string;
  /** Convert icons + write gameIcons.ts (default true; set false on boot paths). */
  convertIcons?: boolean;
}

/** Full catalog import. Idempotent — safe to run on every boot/deploy. */
export async function importCatalog(opts: ImportOptions = {}): Promise<ImportSummary> {
  const { db } = await import('../db');
  const { games } = await import('../db/schema');
  const { DEFAULT_TECHNOLOGIES } = await import('../services/games');
  const { eq } = await import('drizzle-orm');

  // Script lives at apps/api/src/scripts/ → up 4 = project root. (It used to
  // live at apps/api/scripts/, and the defaults were never re-anchored after
  // the move — fixed here.)
  const iconDir = path.resolve(opts.iconDir ?? path.join(__dirname, '../../../../icon/game icon'));
  const outputDir = path.resolve(opts.outputDir ?? path.join(__dirname, '../../../../apps/desktop/public/game-icons'));
  const doConvert = opts.convertIcons ?? true;

  if (!existsSync(iconDir)) throw new Error(`Icon directory not found: ${iconDir}`);

  const { entries, missingIcons, duplicates } = scanIconDir(iconDir);
  const duplicatesResolved = duplicates + countDuplicates(entries.map((e) => e.slug));

  const summary: ImportSummary = {
    foldersFound: entries.length + missingIcons.length,
    gamesImported: 0,
    gamesAlreadyPresent: 0,
    duplicatesResolved,
    missingIcons,
    iconConversionFailed: [],
    databaseErrors: [],
    iconsWritten: 0,
  };

  for (const entry of entries) {
    try {
      const existing = await db.query.games.findFirst({ where: eq(games.slug, entry.slug) });
      if (existing) {
        summary.gamesAlreadyPresent += 1;
        await ensureProfiles(existing.id, entry.slug);
        continue;
      }
      const [row] = await db
        .insert(games)
        .values({
          slug: entry.slug,
          name: entry.folder,
          technologies: DEFAULT_TECHNOLOGIES,
          performanceRating: 50,
          featured: false,
          status: 'published',
          viewCount: 0,
        })
        .returning();
      await ensureProfiles(row!.id, entry.slug);
      summary.gamesImported += 1;
    } catch (err) {
      summary.databaseErrors.push({ slug: entry.slug, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (doConvert) {
    const conversion = convertIcons(entries, outputDir);
    summary.iconsWritten = conversion.iconsWritten;
    summary.iconConversionFailed = conversion.failed;
    writeGameIconsModule(outputDir);
  }

  return summary;
}

function countDuplicates(slugs: string[]): number {
  const seen = new Set<string>();
  let dup = 0;
  for (const s of slugs) {
    if (seen.has(s)) dup += 1;
    else seen.add(s);
  }
  return dup;
}

export function formatSummary(s: ImportSummary): string {
  const lines = [
    'Game Catalog Import Complete',
    '',
    `Folders found:          ${s.foldersFound}`,
    `Games imported:         ${s.gamesImported}`,
    `Games already present:  ${s.gamesAlreadyPresent}`,
    `Duplicates resolved:    ${s.duplicatesResolved}`,
    `Missing icons:          ${s.missingIcons.length}`,
    `Icons written:          ${s.iconsWritten}`,
    `Database errors:        ${s.databaseErrors.length}`,
  ];
  for (const m of s.missingIcons) lines.push(`  ✗ missing icon: ${m.folder} — ${m.reason}`);
  for (const e of s.databaseErrors) lines.push(`  ✗ db error: ${e.slug} — ${e.error}`);
  for (const f of s.iconConversionFailed) lines.push(`  ✗ icon conversion: ${f.slug} — ${f.error}`);
  return lines.join('\n');
}

async function main() {
  // Standalone dev defaults — overridable via env (matches dev-embedded).
  // Some shells export PORT=0, which the config validator rejects — normalize.
  process.env.NODE_ENV ||= 'development';
  process.env.PORT = process.env.PORT && process.env.PORT !== '0' ? process.env.PORT : '4000';
  process.env.DATABASE_URL ||= 'postgres://goh:goh@127.0.0.1:54329/goh';

  process.stdout.write('📦 Importing game catalog…\n');
  const summary = await importCatalog({
    // Documented in the file header but previously never wired up.
    iconDir: process.env.GOH_ICON_DIR || undefined,
    outputDir: process.env.GOH_OUTPUT_DIR || undefined,
    convertIcons: process.env.GOH_NO_CONVERT === '1' ? false : undefined,
  });
  process.stdout.write(formatSummary(summary) + '\n');
  const { pool } = await import('../db');
  await pool.end();
  if (summary.databaseErrors.length > 0 || summary.missingIcons.length > 0) {
    process.exitCode = 1;
  }
}

// Run directly when invoked via `npm run catalog:import` (not when imported).
if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Catalog import failed:', err);
    process.exit(1);
  });
}
