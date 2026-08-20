/**
 * Logical database backup — dumps every table to a single JSON file.
 *
 *   DATABASE_URL=… npx tsx src/scripts/backup-db.ts [outFile]
 *
 * Written because the deployment host has no `pg_dump` binary (the database
 * only exists inside the Postgres container). The schema itself lives in
 * `drizzle/` and is replayed by migrate.ts, so a backup only needs the rows:
 * restore = fresh DB + migrations + `restore-db.ts`.
 *
 * Tables are dumped in dependency order and restored the same way so foreign
 * keys resolve without having to disable constraints.
 */
import { writeFileSync } from 'node:fs';
import { pool } from '../db';

/** Parents before children — restore replays this order verbatim. */
const TABLE_ORDER = [
  'admins',
  'users',
  'sessions',
  'user_sessions',
  'categories',
  'tags',
  'optimization_categories',
  'games',
  'game_categories',
  'game_tags',
  'game_images',
  'game_requirements',
  'optimization_profiles',
  'optimization_settings',
  'optimization_options',
  'optimization_packages',
  'package_files',
  'optimization_package_versions',
  'subscription_plans',
  'subscriptions',
  'payments',
  'entitlements',
  'devices',
  'favorites',
  'views',
  'app_versions',
  'app_config',
  'audit_logs',
  'client_errors',
  'email_logs',
  'otp_codes',
  'login_attempts',
];

async function main() {
  const out = process.argv[2] ?? `backup-db-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  // Only dump tables that actually exist — the list above is intentionally
  // broad so it keeps working as the schema grows.
  const { rows: existing } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const present = new Set(existing.map((r) => r.table_name));
  const ordered = TABLE_ORDER.filter((t) => present.has(t));
  const extra = [...present].filter((t) => !TABLE_ORDER.includes(t) && t !== '__drizzle_migrations');

  const dump: Record<string, unknown[]> = {};
  let total = 0;
  for (const table of [...ordered, ...extra]) {
    const { rows } = await pool.query(`SELECT * FROM "${table}"`);
    dump[table] = rows;
    total += rows.length;
    process.stdout.write(`  ${table}: ${rows.length}\n`);
  }

  writeFileSync(
    out,
    JSON.stringify({ takenAt: new Date().toISOString(), tableOrder: [...ordered, ...extra], tables: dump }, null, 0),
    'utf-8',
  );
  process.stdout.write(`\n✅ ${total} rows across ${Object.keys(dump).length} tables → ${out}\n`);
  if (extra.length) process.stdout.write(`   (tables not in TABLE_ORDER, appended last: ${extra.join(', ')})\n`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('❌ Backup failed:', err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
