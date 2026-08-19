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
 * Files with no YELLOW/GREEN header (a handful do this) are treated as a
 * single Yellow list. Freeform lines that aren't "NAME---VALUE" (tutorial
 * text, YouTube links) are kept as the profile's `description`, never
 * fabricated into fake settings rows.
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
}

export interface ParsedGame {
  fileName: string;
  gameName: string;
  yellow: ParsedSetting[];
  green: ParsedSetting[];
  notes: string[];
}

const HEADER_YELLOW = /^OPTIMI(?:S|Z)ED-SETTINGS-YELLOW$/i;
const HEADER_GREEN = /^OPTIMI(?:S|Z)ED-SETTINGS-GREEN$/i;
const SEPARATOR = /^=+$/;
/** "NAME ---(2+ dashes)--- VALUE" — the format used throughout these files. */
const SETTING_LINE = /^(.+?)-{2,}\s*(.+)$/;

export function parseOptimizedSettingsContent(fileName: string, content: string): ParsedGame {
  const gameName = fileName.replace(/\.txt$/i, '').trim();
  const yellow: ParsedSetting[] = [];
  const green: ParsedSetting[] = [];
  const notes: string[] = [];
  let current: 'yellow' | 'green' | null = null;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || SEPARATOR.test(line)) continue;
    if (HEADER_YELLOW.test(line)) {
      current = 'yellow';
      continue;
    }
    if (HEADER_GREEN.test(line)) {
      current = 'green';
      continue;
    }
    const match = SETTING_LINE.exec(line);
    if (match) {
      const setting: ParsedSetting = { name: match[1]!.trim(), value: match[2]!.trim() };
      (current === 'green' ? green : yellow).push(setting);
    } else {
      notes.push(line);
    }
  }

  return { fileName, gameName, yellow, green, notes };
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

  const parsed = readOptimizedSettingsDir(dir);
  const summary: ImportSummary = {
    filesFound: parsed.length,
    gamesMatched: 0,
    gamesCreated: 0,
    profilesWritten: 0,
    settingsWritten: 0,
    skipped: [],
  };

  for (const entry of parsed) {
    if (entry.yellow.length === 0 && entry.green.length === 0) {
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
            name: color === 'yellow' ? 'Yellow' : 'Green',
            description,
            hardwareTier: color === 'yellow' ? 'high_end' : 'ultra',
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
