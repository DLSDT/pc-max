/**
 * Re-point every serial id sequence at its table's current maximum.
 *
 *   DATABASE_URL=… npx tsx src/scripts/fix-sequences.ts
 *
 * A restore inserts rows with their original ids, which never advances the
 * sequences. Left at 1 while the table holds ids 1..N, the next ordinary
 * insert fails with "duplicate key value violates unique constraint". On the
 * production server that broke POST /auth/login and POST /views — every sign-in
 * returned a 500 while the API otherwise looked healthy.
 *
 * restore-db.ts now does this at the end of a restore. This exists to repair a
 * database that was restored before that fix. Safe to run any time: it only
 * moves a sequence forward to match data that is already there, and it is
 * idempotent.
 */
import { pool } from '../db';

interface SeqRow {
  table_name: string;
  column_name: string;
  seq: string;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<SeqRow>(
      `SELECT c.relname AS table_name, a.attname AS column_name,
              pg_get_serial_sequence(quote_ident(c.relname), a.attname) AS seq
         FROM pg_class c
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND pg_get_serial_sequence(quote_ident(c.relname), a.attname) IS NOT NULL
        ORDER BY c.relname`,
    );

    if (rows.length === 0) {
      process.stdout.write('No serial sequences in this database — nothing to do.\n');
      return;
    }

    let repaired = 0;
    for (const { table_name, column_name, seq } of rows) {
      const before = await client.query<{ last_value: string; is_called: boolean }>(
        `SELECT last_value, is_called FROM ${seq}`,
      );
      const max = await client.query<{ max: string | null }>(
        `SELECT max("${column_name}")::text AS max FROM "${table_name}"`,
      );
      const maxId = max.rows[0]?.max === null ? null : Number(max.rows[0]?.max);
      const lastValue = Number(before.rows[0]!.last_value);
      const isCalled = before.rows[0]!.is_called;
      // The next id this sequence would hand out.
      const nextId = isCalled ? lastValue + 1 : lastValue;
      const broken = maxId !== null && nextId <= maxId;

      await client.query(
        `SELECT setval('${seq}',
                       COALESCE((SELECT max("${column_name}") FROM "${table_name}"), 1),
                       (SELECT max("${column_name}") FROM "${table_name}") IS NOT NULL)`,
      );

      if (broken) {
        repaired += 1;
        process.stdout.write(
          `  ⚠ ${table_name}.${column_name}: next id was ${nextId} but rows reach ${maxId} — would have collided. Fixed.\n`,
        );
      } else {
        process.stdout.write(`  ✓ ${table_name}.${column_name}: already correct.\n`);
      }
    }

    process.stdout.write(
      repaired > 0
        ? `\n✅ Repaired ${repaired} of ${rows.length} sequence(s).\n`
        : `\n✅ All ${rows.length} sequence(s) were already correct.\n`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ fix-sequences failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
