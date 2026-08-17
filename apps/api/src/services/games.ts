import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  categories,
  gameCategories,
  gameImages,
  gameTags,
  games,
  optimizationProfiles,
  tags,
} from '../db/schema';
import { notFound } from '../lib/errors';
import type { DefaultProfileRef, GameSummary, Technologies } from '@goh/validation';

export const DEFAULT_TECHNOLOGIES: Technologies = {
  dlss: false,
  fsr: false,
  xess: false,
  ray_tracing: false,
  frame_generation: false,
  nvidia: true,
  amd: true,
  intel: true,
};

export function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

/** Row type returned by the games table. */
export type GameRow = typeof games.$inferSelect;

/**
 * Attach cover URLs, categories, tags and the default optimization profile to
 * a set of game rows. Returns the same rows in the same order.
 */
export async function attachGameMetadata(rows: GameRow[]): Promise<GameRow[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);

  // Cover URLs
  const covers = await db
    .select({ gameId: gameImages.gameId, url: gameImages.url })
    .from(gameImages)
    .where(and(inArray(gameImages.gameId, ids), eq(gameImages.type, 'cover')))
    .orderBy(gameImages.sortOrder);

  const coverByGame = new Map<string, string>();
  for (const c of covers) {
    if (!coverByGame.has(c.gameId)) coverByGame.set(c.gameId, c.url);
  }

  // Categories
  const cats = await db
    .select({ gameId: gameCategories.gameId, slug: categories.slug, name: categories.name })
    .from(gameCategories)
    .innerJoin(categories, eq(gameCategories.categoryId, categories.id))
    .where(inArray(gameCategories.gameId, ids));

  const catsByGame = new Map<string, { slug: string; name: string }[]>();
  for (const c of cats) {
    const list = catsByGame.get(c.gameId) ?? [];
    list.push({ slug: c.slug, name: c.name });
    catsByGame.set(c.gameId, list);
  }

  // Tags
  const tagRows = await db
    .select({ gameId: gameTags.gameId, slug: tags.slug, name: tags.name })
    .from(gameTags)
    .innerJoin(tags, eq(gameTags.tagId, tags.id))
    .where(inArray(gameTags.gameId, ids));

  const tagsByGame = new Map<string, { slug: string; name: string }[]>();
  for (const t of tagRows) {
    const list = tagsByGame.get(t.gameId) ?? [];
    list.push({ slug: t.slug, name: t.name });
    tagsByGame.set(t.gameId, list);
  }

  // Default optimization profile (published)
  const profiles = await db
    .select()
    .from(optimizationProfiles)
    .where(and(inArray(optimizationProfiles.gameId, ids), isNull(optimizationProfiles.deletedAt)));

  const profileByGame = new Map<string, (typeof optimizationProfiles.$inferSelect)[]>();
  for (const p of profiles) {
    const list = profileByGame.get(p.gameId) ?? [];
    list.push(p);
    profileByGame.set(p.gameId, list);
  }

  for (const row of rows) {
    (row as GameRow & { _cover?: string | null })._cover = coverByGame.get(row.id) ?? null;
    (row as GameRow & { _cats?: unknown })._cats = catsByGame.get(row.id) ?? [];
    (row as GameRow & { _tags?: unknown })._tags = tagsByGame.get(row.id) ?? [];
    const gameProfiles = profileByGame.get(row.id) ?? [];
    const def = gameProfiles.find((p) => p.isDefault && p.status === 'published') ?? gameProfiles.find((p) => p.status === 'published');
    (row as GameRow & { _defaultProfile?: unknown })._defaultProfile = def
      ? {
          slug: def.slug,
          name: def.name,
          version: def.version,
          targetFps: def.targetFps,
          hardwareTier: def.hardwareTier,
        }
      : null;
  }

  return rows;
}

/** Build a GameSummary from a metadata-attached game row. */
export function toSummary(row: GameRow & {
  _cover?: string | null;
  _cats?: { slug: string; name: string }[];
  _defaultProfile?: DefaultProfileRef;
}): GameSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    genres: row._cats ?? [],
    releaseYear: row.releaseDate ? new Date(row.releaseDate).getFullYear() : null,
    engine: row.engine,
    api: row.api,
    technologies: row.technologies,
    performanceRating: row.performanceRating,
    coverUrl: row._cover ?? null,
    status: row.status,
    featured: row.featured,
    defaultProfile: row._defaultProfile ?? null,
  };
}

export async function findPublishedGameBySlug(slug: string) {
  const row = await db.query.games.findFirst({
    where: and(eq(games.slug, slug), eq(games.status, 'published'), isNull(games.deletedAt)),
  });
  if (!row) throw notFound('Game');
  return row;
}

export async function findGameById(id: string) {
  const row = await db.query.games.findFirst({ where: and(eq(games.id, id), isNull(games.deletedAt)) });
  if (!row) throw notFound('Game');
  return row;
}

/** Shared WHERE builder for "published and not deleted" games. */
export function publishedGameWhere() {
  return and(eq(games.status, 'published'), isNull(games.deletedAt));
}

/** Count published games per category slug (for the browse categories payload). */
export async function categoriesWithCounts() {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      gameCount: sql<number>`count(${gameCategories.gameId})::int`,
    })
    .from(categories)
    .leftJoin(gameCategories, eq(gameCategories.categoryId, categories.id))
    .leftJoin(games, and(eq(games.id, gameCategories.gameId), eq(games.status, 'published'), isNull(games.deletedAt)))
    .groupBy(categories.id)
    .orderBy(categories.sortOrder);

  return rows.map((r) => ({ ...r, gameCount: Number(r.gameCount ?? 0) }));
}
