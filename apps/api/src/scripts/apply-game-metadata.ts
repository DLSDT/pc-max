/**
 * Apply curated game metadata (developer/publisher/engine/api/releaseYear):
 *
 *   DATABASE_URL=… npx tsx src/scripts/apply-game-metadata.ts [--overwrite]
 *
 * By default this only fills a field that is currently NULL — it never
 * replaces a value an admin has since edited by hand. `--overwrite` replaces
 * every field the curated table has an answer for, for re-running after the
 * table itself is corrected.
 *
 * Idempotent either way: re-running with no table changes touches nothing.
 * A slug in the table with no matching game is reported, never silently
 * skipped — same convention as apply-catalog-metadata.ts.
 */
import { eq, isNull, and, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { games } from '../db/schema';
import { GAME_METADATA } from '../db/game-metadata';

async function main() {
  const overwrite = process.argv.includes('--overwrite');

  const existingSlugs = new Set((await db.select({ slug: games.slug }).from(games)).map((g) => g.slug));
  const unknown = Object.keys(GAME_METADATA).filter((slug) => !existingSlugs.has(slug));
  if (unknown.length) {
    process.stderr.write(`⚠ ${unknown.length} curated slug(s) have no matching game (catalogue changed?): ${unknown.join(', ')}\n`);
  }

  let updated = 0;
  let untouched = 0;
  let skippedNoData = 0;

  for (const [slug, meta] of Object.entries(GAME_METADATA)) {
    if (!existingSlugs.has(slug)) continue;
    const hasAnyField = meta.developer || meta.publisher || meta.engine || meta.api || meta.releaseYear;
    if (!hasAnyField) {
      skippedNoData++;
      continue;
    }

    const set: Record<string, unknown> = {};
    if (meta.developer !== null) set.developer = meta.developer;
    if (meta.publisher !== null) set.publisher = meta.publisher;
    if (meta.engine !== null) set.engine = meta.engine;
    if (meta.api !== null) set.api = meta.api;
    if (meta.releaseYear !== null) set.releaseDate = new Date(Date.UTC(meta.releaseYear, 0, 1));

    if (Object.keys(set).length === 0) {
      skippedNoData++;
      continue;
    }

    const where = overwrite
      ? eq(games.slug, slug)
      : and(
          eq(games.slug, slug),
          sql`(${games.developer} is null or ${games.publisher} is null or ${games.engine} is null or ${games.api} is null or ${games.releaseDate} is null)`,
        );

    const result = await db.update(games).set(set).where(where).returning({ id: games.id });
    if (result.length > 0) updated++;
    else untouched++;
  }

  process.stdout.write(
    `✓ ${updated} game(s) updated, ${untouched} already had every field set${overwrite ? ' (overwrite mode: still untouched means no curated fields differed)' : ''}, ${skippedNoData} had no curated data\n`,
  );
}

main()
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void pool.end());
