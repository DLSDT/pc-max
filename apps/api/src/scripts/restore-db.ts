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

    // node-postgres turns a JS array into a Postgres ARRAY literal ({a,b,c}),
    // which a json/jsonb column rejects — objects happen to serialise fine, so
    // this only bites on array-valued JSON columns like subscription_plans
    // .features. Look the JSON columns up and stringify their values instead.
    const jsonCols = new Map<string, Set<string>>();
    const { rows: jsonMeta } = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type IN ('json', 'jsonb')`,
    );
    for (const r of jsonMeta) {
      if (!jsonCols.has(r.table_name)) jsonCols.set(r.table_name, new Set());
      jsonCols.get(r.table_name)!.add(r.column_name);
    }

    await client.query('BEGIN');

    // subscriptions and payments reference each other, so no single insert
    // order satisfies both. Suspend FK enforcement for this session — the data
    // came out of a consistent database, and the whole thing is one
    // transaction, so a failure still rolls back to a clean state.
    await client.query(`SET session_replication_role = 'replica'`);

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
          const jsonForTable = jsonCols.get(table);
          const placeholders = columns.map((c) => {
            const v = row[c];
            values.push(jsonForTable?.has(c) && v !== null && v !== undefined ? JSON.stringify(v) : v);
            return `$${values.length}`;
          });
          return `(${placeholders.join(', ')})`;
        });
        await client.query(`INSERT INTO "${table}" (${colList}) VALUES ${tuples.join(', ')}`, values);
      }
      total += records.length;
      process.stdout.write(`  ${table}: ${records.length}\n`);
    }

    // Rows were inserted with their original ids, which bypasses every serial
    // sequence — those still point at 1 while the table holds ids 1..N, so the
    // NEXT insert collides on the primary key. That is not a restore-time
    // error: it surfaces later as a 500 the first time a user does something
    // ordinary. It took down /auth/login and /views on the production server.
    const { rows: sequences } = await client.query<{ table_name: string; column_name: string; seq: string }>(
      `SELECT c.relname AS table_name, a.attname AS column_name,
              pg_get_serial_sequence(quote_ident(c.relname), a.attname) AS seq
         FROM pg_class c
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND pg_get_serial_sequence(quote_ident(c.relname), a.attname) IS NOT NULL`,
    );
    for (const { table_name, column_name, seq } of sequences) {
      // setval(..., false) when the table is empty so the sequence starts at 1
      // rather than handing out 0.
      await client.query(
        `SELECT setval('${seq}',
                       COALESCE((SELECT max("${column_name}") FROM "${table_name}"), 1),
                       (SELECT max("${column_name}") FROM "${table_name}") IS NOT NULL)`,
      );
    }

    await client.query(`SET session_replication_role = 'origin'`);
    await client.query('COMMIT');
    process.stdout.write(`\n✅ Restored ${total} rows.\n`);
    if (sequences.length > 0) {
      process.stdout.write(`   Reset ${sequences.length} id sequence(s): ${sequences.map((s) => s.table_name).join(', ')}\n`);
    }
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
