/**
 * Write the bilingual game descriptions from `content/game-descriptions.json`.
 *
 *   DATABASE_URL=… npx tsx src/scripts/apply-game-descriptions.ts [--force] [--dry-run]
 *
 * There is a sibling script that does this over the admin API. That one asks
 * for the admin password every run, which is the right shape for something run
 * from a laptop against a remote server. Applying content to the machine the
 * database is already on does not need to prove anything about who is asking —
 * being inside the container is the proof — so this one takes no credentials,
 * like `apply-catalog-metadata` and `apply-target-fps` beside it.
 *
 * Idempotent: a game that already has text in a language keeps it unless
 * --force is passed, so anything written by hand in the admin panel survives a
 * re-run. A slug matching no game is reported rather than ignored, since a typo
 * would otherwise be a silent no-op.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db';
import { games } from '../db/schema';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

/** Resolves next to the compiled script in the image, and in the repo in dev. */
const FILE = path.resolve(__dirname, '../../content/game-descriptions.json');

interface Entry {
  en?: string;
  fa?: string;
}

async function main() {
  const raw = await readFile(FILE, 'utf8').catch(() => null);
  if (raw === null) {
    console.error(`no descriptions file at ${FILE}`);
    process.exit(1);
  }
  const wanted = JSON.parse(raw) as Record<string, Entry>;
  const slugs = Object.keys(wanted);

  const rows = await db
    .select({
      id: games.id,
      slug: games.slug,
      descriptionEn: games.descriptionEn,
      descriptionFa: games.descriptionFa,
    })
    .from(games);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  const missing = slugs.filter((s) => !bySlug.has(s));
  let written = 0;
  let kept = 0;

  for (const slug of slugs) {
    const game = bySlug.get(slug);
    if (!game) continue;
    const entry = wanted[slug] ?? {};
    const patch: { descriptionEn?: string; descriptionFa?: string } = {};
    if (entry.en && (force || !game.descriptionEn)) patch.descriptionEn = entry.en;
    if (entry.fa && (force || !game.descriptionFa)) patch.descriptionFa = entry.fa;

    if (Object.keys(patch).length === 0) {
      kept += 1;
      continue;
    }
    if (!dryRun) {
      await db.update(games).set({ ...patch, updatedAt: new Date() }).where(eq(games.id, game.id));
    }
    written += 1;
  }

  console.log(
    `${dryRun ? 'would write' : 'wrote'} ${written} description(s)` +
      `${kept ? `, kept ${kept} that already had text` : ''}` +
      `${missing.length ? `, ${missing.length} slug(s) matched no game` : ''}`,
  );
  if (missing.length) for (const s of missing.slice(0, 20)) console.log(`  no such game: ${s}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
