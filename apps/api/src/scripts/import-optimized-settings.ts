/**
 * Optimized Setting (Yellow/Green) importer — reads the `.txt` files the user
 * dropped in `game opti/` (repo root) and turns each into real, published
 * OptimizationProfile rows tagged `colorProfile: 'yellow' | 'green'`.
 *
 *   npm run optimized-setting:import -w @goh/api
 *
 * File format (free-form, tolerant of variation seen across the 62 files):
 *   OPTIMISED-SETTINGS-YELLOW
 *   SETTING NAME ---------------VALUE
 *   ...
 *   ========================================================
 *   (optional freeform notes / tutorial links)
 *   ========================================================
 *   OPTIMISED-SETTINGS-GREEN
 *   SETTING NAME ---------------VALUE
 *   ...
 *
 * A handful of files have no literal YELLOW/GREEN header text but still use
 * the same two-block-separated-by-`====` structure (sometimes labeled e.g.
 * "Pro Players"/"Casual Players" instead) — for those, the first block is
 * treated as Yellow and the block after the separator as Green, matching the
 * position convention every labeled file already uses (and avoiding merging
 * two distinct setting lists — often the same setting name twice with
 * different values — into one profile). Files with no separator at all
 * really are a single undifferentiated list and stay Yellow-only. Freeform
 * lines that aren't "NAME---VALUE" (tutorial text, YouTube links, the
 * "{Pro Players}"/"{Casual Players}" sub-labels themselves) are kept as the
 * profile's `description`, never fabricated into fake settings rows.
 *
 * Games are matched to the existing catalog by exact case-insensitive name;
 * unmatched titles get their own new (published) game row — per explicit
 * instruction, a game must show up here even if it isn't in the user's
 * library or installed on their machine, so it cannot depend on a fuzzy/best
 * -guess match to some unrelated existing catalog entry.
 *
 * Idempotent: re-running replaces (doesn't duplicate) the yellow/green
 * profiles + settings for each parsed game.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { slugifyFolder } from './import-catalog';

export interface ParsedSetting {
  name: string;
  value: string;
  /** From a `((SECTION))` header, used to group rows in the settings table. */
  category?: string;
}

/** Block types the source files use, in the order they should be shown. */
export const PARSED_BLOCKS = ['yellow', 'green', 'multiplay', 'ray_tracing'] as const;
export type ParsedBlock = (typeof PARSED_BLOCKS)[number];

export interface ParsedGame {
  fileName: string;
  gameName: string;
  yellow: ParsedSetting[];
  green: ParsedSetting[];
  /** Competitive/low-latency preset (OPTIMISED-SETTINGS-MULTIPLAY). */
  multiplay: ParsedSetting[];
  /** Opt-in ray tracing add-on (RAY TRACING-OPTIMISED-SETTINGS). */
  rayTracing: ParsedSetting[];
  notes: string[];
}

const HEADER_YELLOW = /^OPTIMI(?:S|Z)ED-SETTINGS-YELLOW$/i;
const HEADER_GREEN = /^OPTIMI(?:S|Z)ED-SETTINGS-GREEN$/i;
/** A third preset in the competitive titles (Warzone, Rust, BF2042, …). */
const HEADER_MULTIPLAY = /^OPTIMI(?:S|Z)ED-SETTINGS-MULTIPLAY$/i;
/** Ray tracing add-on. "RAT" is a typo present in the source files. */
const HEADER_RAY_TRACING = /^RA[YT]\s*[- ]\s*TRACING-OPTIMI(?:S|Z)ED-SETTINGS$/i;
/** `((TEXTURES))` — groups the settings that follow, inside the same block. */
const CATEGORY_LINE = /^\(\((.+)\)\)$/;
const SEPARATOR = /^=+$/;

/** Display name + hardware tier per block type. */
const PROFILE_LABEL: Record<ParsedBlock, string> = {
  yellow: 'Yellow',
  green: 'Green',
  multiplay: 'Multiplayer',
  ray_tracing: 'Ray Tracing',
};
const PROFILE_TIER: Record<ParsedBlock, 'high_end' | 'ultra' | 'mid_range'> = {
  yellow: 'high_end',
  green: 'ultra',
  // Competitive presets trade visuals for frames — they target lower tiers.
  multiplay: 'mid_range',
  ray_tracing: 'ultra',
};
/** "NAME ---(2+ dashes)--- VALUE" — the format used throughout these files. */
const SETTING_LINE = /^(.+?)-{2,}\s*(.+)$/;

export function parseOptimizedSettingsContent(fileName: string, content: string): ParsedGame {
  const gameName = fileName.replace(/\.txt$/i, '').trim();
  const blocks: Record<ParsedBlock, ParsedSetting[]> = { yellow: [], green: [], multiplay: [], ray_tracing: [] };
  const notes: string[] = [];
  let current: ParsedBlock | null = null;
  let sawHeader = false;
  let category: string | undefined;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (SEPARATOR.test(line)) {
      // No explicit YELLOW/GREEN header seen yet but we've already collected
      // a first block of settings — the separator marks the start of the
      // second block. Treat it as Green (same first-block-Yellow convention
      // every labeled file follows) instead of letting it fall through and
      // merge into the same Yellow list as the first block.
      if (!sawHeader && blocks.yellow.length > 0 && current !== 'green') current = 'green';
      continue;
    }
    // A block header starts a new list AND resets the category grouping.
    const header = HEADER_YELLOW.test(line)
      ? 'yellow'
      : HEADER_GREEN.test(line)
        ? 'green'
        : HEADER_MULTIPLAY.test(line)
          ? 'multiplay'
          : HEADER_RAY_TRACING.test(line)
            ? 'ray_tracing'
            : null;
    if (header) {
      current = header;
      sawHeader = true;
      category = undefined;
      continue;
    }

    const cat = CATEGORY_LINE.exec(line);
    if (cat) {
      // Grouping label inside the current block — not a setting, and not a
      // note either (it used to leak into the profile description).
      category = cat[1]!.trim();
      continue;
    }

    const match = SETTING_LINE.exec(line);
    if (match) {
      const setting: ParsedSetting = { name: match[1]!.trim(), value: match[2]!.trim() };
      if (category) setting.category = category;
      blocks[current ?? 'yellow']!.push(setting);
    } else {
      notes.push(line);
    }
  }

  return {
    fileName,
    gameName,
    yellow: blocks.yellow,
    green: blocks.green,
    multiplay: blocks.multiplay,
    rayTracing: blocks.ray_tracing,
    notes,
  };
}

export function readOptimizedSettingsDir(dir: string): ParsedGame[] {
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .sort();
  return files.map((f) => parseOptimizedSettingsContent(f, readFileSync(path.join(dir, f), 'utf-8')));
}

export interface ImportSummary {
  filesFound: number;
  gamesMatched: number;
  gamesCreated: number;
  profilesWritten: number;
  settingsWritten: number;
  skipped: { file: string; reason: string }[];
}

export async function importOptimizedSettings(dir: string): Promise<ImportSummary> {
  const { db } = await import('../db');
  const { games, optimizationProfiles, optimizationSettings } = await import('../db/schema');
  const { DEFAULT_TECHNOLOGIES } = await import('../services/games');
  const { and, eq, ilike } = await import('drizzle-orm');

  const { optimizationCategories } = await import('../db/schema');
  const parsed = readOptimizedSettingsDir(dir);

  // `((TEXTURES))`-style headers group rows in the settings table. Make sure a
  // real optimization_categories row exists for each one, then map name → id.
  const categoryNames = [
    ...new Set(
      parsed.flatMap((g) =>
        [...g.yellow, ...g.green, ...g.multiplay, ...g.rayTracing]
          .map((s) => s.category)
          .filter((c): c is string => Boolean(c)),
      ),
    ),
  ];
  if (categoryNames.length > 0) {
    await db
      .insert(optimizationCategories)
      .values(categoryNames.map((name, i) => ({ slug: slugifyFolder(name), name, sortOrder: 100 + i })))
      .onConflictDoNothing();
  }
  const categoryIdByName = new Map(
    (await db.select({ id: optimizationCategories.id, name: optimizationCategories.name }).from(optimizationCategories)).map(
      (c) => [c.name.toLowerCase(), c.id] as const,
    ),
  );
  const summary: ImportSummary = {
    filesFound: parsed.length,
    gamesMatched: 0,
    gamesCreated: 0,
    profilesWritten: 0,
    settingsWritten: 0,
    skipped: [],
  };

  for (const entry of parsed) {
    if (entry.yellow.length === 0 && entry.green.length === 0 && entry.multiplay.length === 0 && entry.rayTracing.length === 0) {
      summary.skipped.push({ file: entry.fileName, reason: 'no parseable settings found' });
      continue;
    }

    let game = await db.query.games.findFirst({ where: ilike(games.name, entry.gameName) });
    if (game) {
      summary.gamesMatched += 1;
    } else {
      const slug = slugifyFolder(entry.gameName);
      const existingSlug = await db.query.games.findFirst({ where: eq(games.slug, slug) });
      const [created] = await db
        .insert(games)
        .values({
          slug: existingSlug ? `${slug}-optimized-setting` : slug,
          name: entry.gameName,
          technologies: DEFAULT_TECHNOLOGIES,
          performanceRating: 50,
          featured: false,
          status: 'published',
          viewCount: 0,
        })
        .returning();
      game = created!;
      summary.gamesCreated += 1;
    }

    const description = entry.notes.length > 0 ? entry.notes.join('\n') : null;

    for (const [color, settingsList] of [
      ['yellow', entry.yellow],
      ['green', entry.green],
      ['multiplay', entry.multiplay],
      ['ray_tracing', entry.rayTracing],
    ] as const) {
      if (settingsList.length === 0) continue;

      const profileSlug = `optimized-setting-${color}`;
      let profile = await db.query.optimizationProfiles.findFirst({
        where: and(eq(optimizationProfiles.gameId, game.id), eq(optimizationProfiles.slug, profileSlug)),
      });

      if (profile) {
        await db
          .update(optimizationProfiles)
          .set({ description, status: 'published', colorProfile: color, publishedAt: profile.publishedAt ?? new Date(), updatedAt: new Date() })
          .where(eq(optimizationProfiles.id, profile.id));
        await db.delete(optimizationSettings).where(eq(optimizationSettings.profileId, profile.id));
      } else {
        const [created] = await db
          .insert(optimizationProfiles)
          .values({
            gameId: game.id,
            slug: profileSlug,
            name: PROFILE_LABEL[color],
            description,
            hardwareTier: PROFILE_TIER[color],
            colorProfile: color,
            version: '1.0.0',
            status: 'published',
            isDefault: false,
            publishedAt: new Date(),
          })
          .returning();
        profile = created!;
      }
      summary.profilesWritten += 1;

      await db.insert(optimizationSettings).values(
        settingsList.map((s, i) => ({
          profileId: profile!.id,
          categoryId: s.category ? (categoryIdByName.get(s.category.toLowerCase()) ?? null) : null,
          key: slugifyFolder(s.name),
          name: s.name,
          type: 'text' as const,
          value: s.value,
          sortOrder: i,
        })),
      );
      summary.settingsWritten += settingsList.length;
    }
  }

  return summary;
}

function formatSummary(s: ImportSummary): string {
  const lines = [
    'Optimized Setting (Yellow/Green) Import Complete',
    '',
    `Files found:        ${s.filesFound}`,
    `Games matched:       ${s.gamesMatched}`,
    `Games created:       ${s.gamesCreated}`,
    `Profiles written:    ${s.profilesWritten}`,
    `Settings written:    ${s.settingsWritten}`,
    `Skipped:             ${s.skipped.length}`,
  ];
  for (const sk of s.skipped) lines.push(`  ✗ ${sk.file} — ${sk.reason}`);
  return lines.join('\n');
}

async function main() {
  process.env.NODE_ENV ||= 'development';
  process.env.PORT = process.env.PORT && process.env.PORT !== '0' ? process.env.PORT : '4000';
  process.env.DATABASE_URL ||= 'postgres://goh:goh@127.0.0.1:54329/goh';

  const dir = process.env.GOH_OPTIMIZED_SETTING_DIR || path.resolve(__dirname, '../../../../game opti');
  process.stdout.write(`📦 Importing Optimized Setting data from ${dir}\n`);
  const summary = await importOptimizedSettings(dir);
  process.stdout.write(formatSummary(summary) + '\n');
  const { pool } = await import('../db');
  await pool.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Optimized Setting import failed:', err);
    process.exit(1);
  });
}
