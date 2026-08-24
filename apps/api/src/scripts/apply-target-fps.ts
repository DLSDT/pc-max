/**
 * Set `optimization_profiles.target_fps` from the kind of preset each profile is.
 *
 *   DATABASE_URL=… npx tsx src/scripts/apply-target-fps.ts [--force] [--dry-run]
 *
 * Every profile shipped with `target_fps` NULL, so the detail page showed "—"
 * where a number belongs. The target is the frame rate a preset AIMS at, which
 * is a property of the preset itself — so it is derived from `color_profile`
 * rather than invented per game:
 *
 *   ray_tracing  60   a quality add-on; it costs frames by design
 *   green        90   preserves visual quality while still running well
 *   yellow      120   trades some quality for frames
 *   multiplay   144   competitive; latency over looks
 *
 * Deliberately uniform within a preset. The obvious next refinement would be to
 * vary by how demanding the game is, and `games.performance_rating` looks like
 * the field for it — but every one of the 313 rows is 50, so it carries no
 * information. Varying on it would only manufacture differences that are not
 * real. When that column holds actual per-game values, this is the place to
 * fold it in.
 *
 * Idempotent: only fills NULLs unless --force is passed, so a target an admin
 * has set by hand is never overwritten by a re-run.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db, pool } from '../db';
import { optimizationProfiles } from '../db/schema';

/** Frames each preset aims at. Keys must match the `profile_color` enum. */
const TARGET_FPS: Record<string, number> = {
  ray_tracing: 60,
  green: 90,
  yellow: 120,
  multiplay: 144,
};

async function main() {
  const force = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');

  const rows = await db
    .select({
      id: optimizationProfiles.id,
      color: optimizationProfiles.colorProfile,
      target: optimizationProfiles.targetFps,
    })
    .from(optimizationProfiles)
    .where(isNull(optimizationProfiles.deletedAt));

  let updated = 0;
  let skippedSet = 0;
  const unmapped = new Map<string, number>();

  for (const row of rows) {
    if (!row.color) {
      unmapped.set('(no colour)', (unmapped.get('(no colour)') ?? 0) + 1);
      continue;
    }
    const want = TARGET_FPS[row.color];
    if (want === undefined) {
      // A new colour nobody taught this script about: report it rather than
      // guessing a number for it.
      unmapped.set(row.color, (unmapped.get(row.color) ?? 0) + 1);
      continue;
    }
    if (row.target !== null && !force) {
      skippedSet += 1;
      continue;
    }
    if (row.target === want) continue;

    if (!dryRun) {
      await db
        .update(optimizationProfiles)
        .set({ targetFps: want, updatedAt: new Date() })
        .where(and(eq(optimizationProfiles.id, row.id)));
    }
    updated += 1;
  }

  const verb = dryRun ? 'would set' : 'set';
  process.stdout.write(`  ${verb} target_fps on ${updated} profile(s)\n`);
  if (skippedSet) process.stdout.write(`  left ${skippedSet} profile(s) that already had a target (use --force to overwrite)\n`);
  for (const [colour, n] of unmapped) {
    process.stdout.write(`  ⚠ ${n} profile(s) with ${colour} — no target defined, left as they are\n`);
  }
}

main()
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
