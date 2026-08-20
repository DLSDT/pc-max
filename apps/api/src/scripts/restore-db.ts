/**
 * Restore a backup produced by `backup-db.ts`.
 *
 *   DATABASE_URL=… npx tsx src/scripts/restore-db.ts <backup.json> [--force]
 *
 * Expects a database whose schema is already migrated (run migrate.ts first);
 * this only replays rows. Tables are truncated and refilled in the dump's own
 * dependency order inside ONE transaction, so a failure anywhere rolls the
 * whole thing back rather than leaving a half-restored database.
 *
 * `--force` is required when the target database is not empty, so a stray run
 * can't wipe live data by accident.
 */
import { readFileSync } from 'node:fs';
import { pool } from '../db';

interface Dump {
  takenAt: string;
  tableOrder: string[];
  tables: Record<string, Record<string, unknown>[]>;
}

async function main() {
  const file = process.argv[2];
  const force = process.argv.includes('--force');
  if (!file) {
    process.stderr.write('Usage: restore-db.ts <backup.json> [--force]\n');
    process.exit(1);
  }

  const dump = JSON.parse(readFileSync(file, 'utf-8')) as Dump;
  process.stdout.write(`📦 Restoring backup taken ${dump.takenAt}\n`);

  const client = await pool.connect();
  try {
    // Refuse to clobber a populated database unless explicitly forced.
    const { rows } = await client.query<{ n: string }>('SELECT count(*) AS n FROM games');
    if (Number(rows[0]?.n ?? 0) > 0 && !force) {
      throw new Error(`Target database already has ${rows[0]!.n} games. Re-run with --force to overwrite.`);
    }

    await client.query('BEGIN');

    // Children first when clearing, parents first when inserting.
    for (const table of [...dump.tableOrder].reverse()) {
      await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
    }

    let total = 0;
    for (const table of dump.tableOrder) {
      const records = dump.tables[table] ?? [];
      if (records.length === 0) continue;

      const columns = Object.keys(records[0]!);
      const colList = columns.map((c) => `"${c}"`).join(', ');

      // Batch to keep the parameter count under Postgres' 65535 limit.
      const perBatch = Math.max(1, Math.floor(60000 / columns.length));
      for (let i = 0; i < records.length; i += perBatch) {
        const batch = records.slice(i, i + perBatch);
        const values: unknown[] = [];
        const tuples = batch.map((row) => {
          const placeholders = columns.map((c) => {
            values.push(row[c]);
            return `$${values.length}`;
          });
          return `(${placeholders.join(', ')})`;
        });
        await client.query(`INSERT INTO "${table}" (${colList}) VALUES ${tuples.join(', ')}`, values);
      }
      total += records.length;
      process.stdout.write(`  ${table}: ${records.length}\n`);
    }

    await client.query('COMMIT');
    process.stdout.write(`\n✅ Restored ${total} rows.\n`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Restore failed (rolled back):', err instanceof Error ? err.message : err);
  process.exit(1);
});
