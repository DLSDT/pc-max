/**
 * Apply the curated catalogue metadata: genre links and featured picks.
 *
 *   DATABASE_URL=… npx tsx src/scripts/apply-catalog-metadata.ts [--prune] [--refeature]
 *
 * The imported catalogue arrived with no genre metadata, so `game_categories`
 * was empty and every genre filter option returned zero games. This replays
 * the curated table in db/catalog-metadata.ts.
 *
 * Idempotent: existing links are left alone and re-runs insert only what is
 * missing. `--prune` additionally removes links that the table no longer
 * lists, for when a game is re-classified.
 *
 * Anything that cannot be matched on either side is reported, never skipped
 * silently — an unknown category slug is a typo, and an unmapped game means
 * the catalogue grew and the table needs a new entry.
 */
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { db, pool } from '../db';
import { categories, gameCategories, games } from '../db/schema';
import { FEATURED_GAMES, GAME_GENRES } from '../db/catalog-metadata';
import { ensureTaxonomy } from '../db/seed';

async function main() {
  const prune = process.argv.includes('--prune');
  // Featuring is admin-editable, so only add the curated picks by default;
  // --refeature clears everything else back to exactly this list.
  const refeature = process.argv.includes('--refeature');

  // Categories are created by ensureTaxonomy, which is idempotent; run it so a
  // database seeded before the taxonomy grew picks up the new genres.
  await ensureTaxonomy();

  const catRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const catIdBySlug = new Map(catRows.map((c) => [c.slug, c.id]));
  const gameRows = await db.select({ id: games.id, slug: games.slug }).from(games);
  const gameIdBySlug = new Map(gameRows.map((g) => [g.slug, g.id]));

  const unknownCategories = new Set<string>();
  const unknownGames: string[] = [];
  const wanted = new Map<string, Set<string>>(); // gameId -> categoryIds

  for (const [gameSlug, genreSlugs] of Object.entries(GAME_GENRES)) {
    const gameId = gameIdBySlug.get(gameSlug);
    if (!gameId) {
      unknownGames.push(gameSlug);
      continue;
    }
    const ids = new Set<string>();
    for (const genre of genreSlugs) {
      const catId = catIdBySlug.get(genre);
      if (!catId) unknownCategories.add(genre);
      else ids.add(catId);
    }
    wanted.set(gameId, ids);
  }

  const unmappedGames = gameRows.filter((g) => !(g.slug in GAME_GENRES)).map((g) => g.slug);

  if (unknownCategories.size > 0) {
    throw new Error(`Unknown category slugs in GAME_GENRES: ${[...unknownCategories].join(', ')}`);
  }

  const existing = await db.select({ gameId: gameCategories.gameId, categoryId: gameCategories.categoryId }).from(gameCategories);
  const have = new Map<string, Set<string>>();
  for (const row of existing) {
    if (!have.has(row.gameId)) have.set(row.gameId, new Set());
    have.get(row.gameId)!.add(row.categoryId);
  }

  const toInsert: { gameId: string; categoryId: string }[] = [];
  for (const [gameId, catIds] of wanted) {
    const current = have.get(gameId) ?? new Set<string>();
    for (const categoryId of catIds) {
      if (!current.has(categoryId)) toInsert.push({ gameId, categoryId });
    }
  }

  let pruned = 0;
  if (prune) {
    for (const [gameId, catIds] of have) {
      const keep = wanted.get(gameId);
      if (!keep) continue; // game not in the table — leave its links alone
      const stale = [...catIds].filter((id) => !keep.has(id));
      if (stale.length > 0) {
        await db.delete(gameCategories).where(and(eq(gameCategories.gameId, gameId), inArray(gameCategories.categoryId, stale)));
        pruned += stale.length;
      }
    }
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    await db.insert(gameCategories).values(toInsert.slice(i, i + 500)).onConflictDoNothing();
  }

  // ------------------------------------------------------------- featured
  const featuredIds: string[] = [];
  const missingFeatured: string[] = [];
  for (const slug of FEATURED_GAMES) {
    const id = gameIdBySlug.get(slug);
    if (id) featuredIds.push(id);
    else missingFeatured.push(slug);
  }
  let featuredSet = 0;
  let featuredCleared = 0;
  if (featuredIds.length > 0) {
    const res = await db
      .update(games)
      .set({ featured: true })
      .where(and(inArray(games.id, featuredIds), eq(games.featured, false)))
      .returning({ id: games.id });
    featuredSet = res.length;
    if (refeature) {
      const cleared = await db
        .update(games)
        .set({ featured: false })
        .where(and(notInArray(games.id, featuredIds), eq(games.featured, true)))
        .returning({ id: games.id });
      featuredCleared = cleared.length;
    }
  }

  process.stdout.write(`\n✅ ${toInsert.length} links added${prune ? `, ${pruned} pruned` : ''} (${wanted.size} games mapped)\n`);
  process.stdout.write(`⭐ ${featuredSet} game(s) newly featured${refeature ? `, ${featuredCleared} unfeatured` : ''} (${featuredIds.length} in the curated list)\n`);
  if (missingFeatured.length > 0) {
    process.stdout.write(`\n⚠️  featured slug(s) not in the database: ${missingFeatured.join(', ')}\n`);
  }
  if (unknownGames.length > 0) {
    process.stdout.write(`\n⚠️  ${unknownGames.length} mapped slug(s) are not in the database:\n  ${unknownGames.join('\n  ')}\n`);
  }
  if (unmappedGames.length > 0) {
    process.stdout.write(`\n⚠️  ${unmappedGames.length} game(s) have no genre entry — add them to db/catalog-metadata.ts:\n  ${unmappedGames.join('\n  ')}\n`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error('❌ assign-genres failed:', err instanceof Error ? err.message : err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
