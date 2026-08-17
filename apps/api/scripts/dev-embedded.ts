/**
 * Local full-stack bootstrap — no Docker or external PostgreSQL required.
 *
 * Boots an embedded PostgreSQL instance, applies migrations, seeds the demo
 * content and starts the API on http://127.0.0.1:4000.
 *
 *   npm run dev:embedded -w @goh/api
 *
 * Environment variables are set here BEFORE the API modules are imported
 * because the config is parsed once at module load.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PG_PORT = 54329;
const API_PORT = 4000;
const PG_DATA_DIR = './data/dev-pg';
const UPLOAD_DIR = './data/dev-uploads';

process.env.NODE_ENV = 'development';
process.env.PORT = String(API_PORT);
process.env.DATABASE_URL = `postgres://goh:goh@127.0.0.1:${PG_PORT}/goh`;
process.env.PUBLIC_API_URL = `http://127.0.0.1:${API_PORT}`;
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-embedded-secret-0123456789abcdef';
process.env.ADMIN_BOOTSTRAP_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@gamehub.local';
process.env.ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'Admin123!';

async function main() {
  console.log('🚀 Booting embedded PostgreSQL…');
  // persistent: true keeps the data directory across restarts — otherwise
  // every restart wipes games/profiles created through the admin panel.
  // initialise() runs initdb, which must only happen on a fresh directory.
  const pg = new EmbeddedPostgres({
    databaseDir: PG_DATA_DIR,
    user: 'goh',
    password: 'goh',
    port: PG_PORT,
    persistent: true,
  });
  if (!existsSync(path.join(PG_DATA_DIR, 'PG_VERSION'))) {
    console.log('  (fresh data dir — initializing cluster)');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('goh');
  } catch {
    // Database already exists from a previous run — fine.
  }

  const [{ migrate }, { db, pool }, { runSeed }, { buildApp }] = await Promise.all([
    import('drizzle-orm/node-postgres/migrator'),
    import('../src/db'),
    import('../src/db/seed'),
    import('../src/app'),
  ]);

  console.log('📦 Applying migrations…');
  await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') });

  // Seed only on a fresh database — re-seeding on every boot would wipe any
  // games/profiles created through the admin panel (the seed clears tables).
  const [{ sql }, { games }] = await Promise.all([import('drizzle-orm'), import('../src/db/schema')]);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int`.as('n') }).from(games);
  if (Number(n) === 0) {
    console.log('🌱 Empty database — seeding demo content (14 games, 56 profiles)…');
    await runSeed();
  } else {
    console.log(`🌱 Database already seeded (${Number(n)} games) — skipping seed.`);
  }

  const app = await buildApp();
  await app.listen({ port: API_PORT, host: '127.0.0.1' });

  console.log(`\n✅ API ready:  http://127.0.0.1:${API_PORT}/api/v1`);
  console.log(`   Docs:       http://127.0.0.1:${API_PORT}/docs`);
  console.log(`   Admin:      ${process.env.ADMIN_BOOTSTRAP_EMAIL} / ${process.env.ADMIN_BOOTSTRAP_PASSWORD}`);
  console.log('   Ctrl+C to stop (stops the embedded database cleanly).\n');

  const shutdown = async () => {
    await app.close();
    await pool.end();
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('❌ Failed to start the embedded stack:', err);
  process.exit(1);
});
