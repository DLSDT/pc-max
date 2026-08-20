/**
 * Production migration runner — applies pending Drizzle migrations and exits.
 * Used by the Docker entrypoint before the API starts; the dev bootstrap
 * (scripts/dev-embedded.ts) applies migrations itself.
 *
 *   node dist/db/migrate.js
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { db, pool } from './index';
import { ensureSubscriptionPlans, ensureTaxonomy, seedBootstrapAdmin } from './seed';

async function main() {
  // eslint-disable-next-line no-console
  console.log('📦 Applying database migrations…');
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  // eslint-disable-next-line no-console
  console.log('✅ Migrations up to date.');
  // All three are idempotent, so they are safe on every boot/restart. Without
  // them a fresh deployment comes up with no admin, no browse categories (the
  // Categories page and genre filter render empty) and no subscription plans
  // (the Subscription page has nothing to buy).
  await seedBootstrapAdmin();
  await ensureTaxonomy();
  await ensureSubscriptionPlans();
  await pool.end();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Migration failed:', err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
