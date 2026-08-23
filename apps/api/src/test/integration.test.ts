import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { FastifyInstance } from 'fastify';
import { resolveSlugs, scanIconDir, slugifyFolder } from '../scripts/import-catalog';

// Use a unique port + fresh data dir per run so crashed runs never leave stale state.
const PG_PORT = 55000 + Math.floor(Math.random() * 2000);
const PG_DATA_DIR = `./data/pg-integration-${process.pid}`;
const DB_URL = `postgres://goh:goh@127.0.0.1:${PG_PORT}/goh`;

// Must be set before the API modules are imported (config parses env at load).
process.env.NODE_ENV = 'test';
process.env.PORT = '4999'; // the API port is irrelevant under fastify.inject(); pin it to avoid inherited env
process.env.DATABASE_URL = DB_URL;
process.env.JWT_ACCESS_SECRET = 'integration-test-secret-0123456789abcdef';
process.env.PUBLIC_API_URL = `http://127.0.0.1:${PG_PORT}`;
process.env.UPLOAD_DIR = './data/test-uploads';
process.env.ADMIN_BOOTSTRAP_EMAIL = 'admin@test.local';
process.env.ADMIN_BOOTSTRAP_PASSWORD = 'TestPass123!';
// The whole suite runs from one inject() IP and fires >300 requests inside the
// default 1-minute window. Raise the per-IP ceiling for tests only — the
// security suite still explicitly asserts that route limits return 429.
process.env.RATE_LIMIT_MAX = '10000';

let pg: EmbeddedPostgres;
let app: FastifyInstance;

async function inject(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, opts: { body?: unknown; token?: string } = {}) {
  const res = await app.inject({
    method,
    url,
    payload: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    headers: {
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
  });
  let json: unknown = null;
  try {
    json = res.json();
  } catch {
    json = null;
  }
  return { status: res.statusCode, json: json as Record<string, unknown> & { data?: unknown; error?: { code?: string } } };
}

beforeAll(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: PG_DATA_DIR,
    user: 'goh',
    password: 'goh',
    port: PG_PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('goh');

  // Import API modules now that env is configured.
  const [{ migrate }, { db, pool }, { runSeed }, { buildApp }] = await Promise.all([
    import('drizzle-orm/node-postgres/migrator'),
    import('../db'),
    import('../db/seed'),
    import('../app'),
  ]);
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  await runSeed();
  app = await buildApp();

  return async () => {
    await app.close();
    await pool.end();
    await pg.stop();
  };
}, 180_000);

/** Request an OTP (dev exposure enabled in test env) and return the code. */
async function requestOtp(identifier: string, purpose: 'register' | 'reset'): Promise<string> {
  const res = await inject('POST', '/api/v1/auth/otp/send', { body: { identifier, purpose } });
  expect(res.status).toBe(200);
  const devCode = (res.json as { devCode?: string }).devCode;
  if (!devCode) throw new Error('OTP devCode was not exposed — OTP_EXPOSE must be true in tests');
  return devCode;
}

/** Register a user via the email + OTP flow. */
async function registerUser(identifier: string, password: string, username?: string) {
  const otp = await requestOtp(identifier, 'register');
  return inject('POST', '/api/v1/auth/register', {
    body: { identifier, username, password, otp },
  });
}

afterAll(async () => {
  if (pg) await pg.stop();
});

describe('public API', () => {
  it('serves health', async () => {
    const res = await inject('GET', '/api/v1/health');
    expect(res.status).toBe(200);
  });

  it('serves the OpenAPI docs', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
  });

  it('home aggregates featured, popular and recent', async () => {
    const res = await inject('GET', '/api/v1/home');
    expect(res.status).toBe(200);
    const data = res.json as { featured: unknown[]; popular: unknown[]; recentlyAdded: unknown[]; categories: unknown[] };
    expect(data.featured.length).toBeGreaterThan(0);
    expect(data.popular.length).toBe(10);
    expect(data.recentlyAdded.length).toBe(10);
    expect(data.categories.length).toBeGreaterThan(0);
  });

  it('searches games by name, genre and tag', async () => {
    const byName = await inject('GET', '/api/v1/games?q=gta');
    expect((byName.json.data as { slug: string }[]).some((g) => g.slug === 'gta-v')).toBe(true);

    const byGenre = await inject('GET', '/api/v1/games?genre=open-world');
    expect((byGenre.json.data as unknown[]).length).toBeGreaterThan(1);

    const byTag = await inject('GET', '/api/v1/games?q=difficult');
    expect((byTag.json.data as unknown[]).length).toBeGreaterThan(0);

    const bySlug = await inject('GET', '/api/v1/games?q=dying-light');
    expect((bySlug.json.data as { slug: string }[]).some((g) => g.slug === 'dying-light')).toBe(true);
  });

  it('filters by technology flags', async () => {
    const res = await inject('GET', '/api/v1/games?techs=dlss');
    expect(res.status).toBe(200);
    const games = res.json.data as { slug: string; technologies: Record<string, boolean> }[];
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) expect(g.technologies.dlss).toBe(true);
  });

  it('returns a full game detail', async () => {
    const res = await inject('GET', '/api/v1/games/gta-v');
    expect(res.status).toBe(200);
    const game = res.json as { name: string; requirements: unknown[]; images: unknown[]; genres: unknown[]; defaultProfile: unknown };
    expect(game.name).toBe('Grand Theft Auto V');
    expect(game.requirements.length).toBe(2);
    expect(game.images.length).toBeGreaterThan(0);
    expect(game.defaultProfile).not.toBeNull();
  });

  it('returns optimization profiles with grouped settings', async () => {
    const res = await inject('GET', '/api/v1/games/gta-v/optimizations');
    expect(res.status).toBe(200);
    const profiles = res.json.data as {
      slug: string;
      version: string;
      settings: { category: { slug: string } | null; options: unknown[] }[];
    }[];
    expect(profiles.length).toBe(4);
    const balanced = profiles.find((p) => p.slug === 'balanced')!;
    expect(balanced.version).toBe('1.4.2');
    expect(balanced.settings.length).toBeGreaterThan(10);
    expect(balanced.settings.some((s) => s.options.length > 0)).toBe(true);
  });

  it('syncs incremental content manifests', async () => {
    const full = await inject('GET', '/api/v1/sync');
    expect(full.status).toBe(200);
    const data = full.json as { games: unknown[]; profiles: unknown[]; contentUpdatedAt: string | null };
    expect(data.games.length).toBe(10);
    expect(data.profiles.length).toBe(40);
    expect(data.contentUpdatedAt).not.toBeNull();

    const delta = await inject('GET', `/api/v1/sync?since=${encodeURIComponent(data.contentUpdatedAt!)}`);
    const deltaData = delta.json as { games: unknown[] };
    expect(deltaData.games.length).toBe(0);
  });

  it('registers anonymous devices and records views', async () => {
    const device = await inject('POST', '/api/v1/users/device', { body: { deviceId: 'test-device-0001', platform: 'windows' } });
    expect(device.status).toBe(200);
    const userId = (device.json as { userId: string }).userId;
    expect(userId).toBeTruthy();

    const games = (await inject('GET', '/api/v1/games?limit=1')).json.data as { id: string }[];
    const view = await inject('POST', '/api/v1/views', { body: { deviceId: 'test-device-0001', gameId: games[0]!.id } });
    expect(view.status).toBe(200);
  });

  /**
   * Regression: the list ordered only by a non-unique column, so rows tied on
   * that column could repeat on one page and be skipped on another — the real
   * catalogue had 313 games but only 213 were ever reachable.
   *
   * The tie is the whole point, so this seeds a block of games that share a
   * viewCount, a null releaseDate AND a rating. Without the id tiebreaker in
   * the query's ORDER BY, paging these drops/duplicates rows.
   */
  it('paginates every sort without repeating or dropping tied games', async () => {
    const login = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    const adminToken = (login.json as { accessToken: string }).accessToken;

    for (let i = 0; i < 14; i += 1) {
      const res = await inject('POST', '/api/v1/admin/games', {
        token: adminToken,
        body: {
          name: `Tied Game ${String(i).padStart(2, '0')}`,
          slug: `tied-game-${String(i).padStart(2, '0')}`,
          status: 'published',
          // identical across every row → ties on popular/new/rating
          performanceRating: 50,
        },
      });
      expect(res.status).toBe(201);
    }

    try {

      for (const sort of ['popular', 'new', 'rating', 'name']) {
        const first = await inject('GET', `/api/v1/games?limit=5&page=1&sort=${sort}`);
        expect(first.status).toBe(200);
        const total = (first.json as { meta: { total: number } }).meta.total;

        const seen = new Set<string>();
        const pages = Math.ceil(total / 5);
        for (let page = 1; page <= pages; page += 1) {
          const res = await inject('GET', `/api/v1/games?limit=5&page=${page}&sort=${sort}`);
          for (const g of res.json.data as { id: string }[]) seen.add(g.id);
        }
        expect(seen.size, `sort=${sort} lost or duplicated rows`).toBe(total);
      }
    } finally {
      // The suite shares one database — leave the catalogue exactly as found so
      // later assertions about game counts still hold. Ids are looked up rather
      // than taken from the create response, which does not return them.
      const listed = await inject('GET', '/api/v1/admin/games?q=Tied%20Game&limit=100', { token: adminToken });
      for (const g of (listed.json.data ?? []) as { id: string; slug: string }[]) {
        if (g.slug.startsWith('tied-game-')) {
          await inject('DELETE', `/api/v1/admin/games/${g.id}`, { token: adminToken });
        }
      }
    }
  });

  /**
   * Featured games are ordered by viewCount, and every imported game shares a
   * viewCount of 0 — so without a unique tiebreaker Postgres is free to return
   * a different arbitrary slice each request and the Recommended page
   * reshuffles on every visit.
   */
  it('returns a stable featured slice when view counts tie', async () => {
    const login = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    const adminToken = (login.json as { accessToken: string }).accessToken;

    const created: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await inject('POST', '/api/v1/admin/games', {
        token: adminToken,
        body: {
          name: `Featured Tie ${String(i).padStart(2, '0')}`,
          slug: `featured-tie-${String(i).padStart(2, '0')}`,
          status: 'published',
          featured: true,
        },
      });
      expect(res.status).toBe(201);
      created.push(`featured-tie-${String(i).padStart(2, '0')}`);
    }

    try {
      const ids = async (limit: number) =>
        ((await inject('GET', `/api/v1/featured?limit=${limit}`)).json.data as { id: string }[]).map((g) => g.id);

      const first = await ids(6);
      expect(first).toHaveLength(6);
      for (let i = 0; i < 4; i += 1) {
        expect(await ids(6), 'featured slice changed between identical requests').toEqual(first);
      }

      // The Recommended page asks for a full grid, which the row-sized default
      // ceiling used to cap; the wider slice must start with the same rows.
      const wide = await ids(24);
      expect(wide.length).toBeGreaterThan(6);
      expect(wide.slice(0, 6)).toEqual(first);
    } finally {
      const listed = await inject('GET', '/api/v1/admin/games?q=Featured%20Tie&limit=100', { token: adminToken });
      for (const g of (listed.json.data ?? []) as { id: string; slug: string }[]) {
        if (created.includes(g.slug)) {
          await inject('DELETE', `/api/v1/admin/games/${g.id}`, { token: adminToken });
        }
      }
    }
  });
});

/**
 * The auto-updater installs whatever this feed returns, unattended, on every
 * user's machine — so "which row is latest" has to be one answer, not two.
 */
describe('updater feed', () => {
  let adminToken: string;
  const created: string[] = [];

  async function publish(version: string) {
    const res = await inject('POST', '/api/v1/admin/app-versions', {
      token: adminToken,
      body: {
        version,
        platform: 'windows',
        channel: 'stable',
        downloadUrl: `https://example.test/PCMAX-${version}.exe`,
        signature: `sig-${version}`,
      },
    });
    expect(res.status, `publishing ${version}`).toBe(201);
    created.push(version);
  }

  beforeAll(async () => {
    const login = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    adminToken = (login.json as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    const listed = await inject('GET', '/api/v1/admin/app-versions', { token: adminToken });
    for (const v of (listed.json.data ?? listed.json ?? []) as { id: string; version: string }[]) {
      if (created.includes(v.version)) {
        await inject('DELETE', `/api/v1/admin/app-versions/${v.id}`, { token: adminToken });
      }
    }
  });

  it('serves the highest semver, not the most recently created row', async () => {
    await publish('9.1.0');
    // Created later, but a LOWER version — ordering on releasedAt would hand
    // this to every user still on an older build.
    await publish('9.0.5');

    const res = await inject('GET', '/api/v1/updates/windows/x86_64/8.0.0');
    expect(res.status).toBe(200);
    expect((res.json as { version: string }).version).toBe('9.1.0');
  });

  it('tells an up-to-date client there is nothing to install', async () => {
    const res = await inject('GET', '/api/v1/updates/windows/x86_64/9.1.0');
    expect(res.status).toBe(204);
  });

  it('pins an older build when an admin marks it latest', async () => {
    // The rollback path: 9.1.0 turned out bad, so the admin clicks "mark
    // latest" on 9.0.5 and every client must be offered 9.0.5 from then on.
    // This used to recompute "highest semver wins" and silently keep 9.1.0.
    const listed = await inject('GET', '/api/v1/admin/app-versions', { token: adminToken });
    const rows = (listed.json.data ?? listed.json ?? []) as { id: string; version: string }[];
    const older = rows.find((v) => v.version === '9.0.5');
    expect(older, 'expected the 9.0.5 row').toBeDefined();

    const res = await inject('PATCH', `/api/v1/admin/app-versions/${older!.id}/state`, { token: adminToken });
    expect(res.status).toBe(200);

    const feed = await inject('GET', '/api/v1/updates/windows/x86_64/8.0.0');
    expect(feed.status).toBe(200);
    expect((feed.json as { version: string }).version).toBe('9.0.5');

    // A client already on the pinned build has nothing to install.
    expect((await inject('GET', '/api/v1/updates/windows/x86_64/9.0.5')).status).toBe(204);

    // Put 9.1.0 back so the following test sees the state it expects.
    const top = rows.find((v) => v.version === '9.1.0');
    await inject('PATCH', `/api/v1/admin/app-versions/${top!.id}/state`, { token: adminToken });
  });

  it('refuses to pin a build the updater could never serve', async () => {
    // An unsigned release makes the feed return 204 to everyone, so pinning
    // one would stop updates entirely with no visible cause.
    const res = await inject('POST', '/api/v1/admin/app-versions', {
      token: adminToken,
      body: {
        version: '9.2.0',
        platform: 'windows',
        channel: 'stable',
        downloadUrl: 'https://example.test/PCMAX-9.2.0.exe',
      },
    });
    expect(res.status).toBe(201);
    created.push('9.2.0');

    const listed = await inject('GET', '/api/v1/admin/app-versions', { token: adminToken });
    const unsigned = ((listed.json.data ?? listed.json ?? []) as { id: string; version: string }[]).find(
      (v) => v.version === '9.2.0',
    );
    const pin = await inject('PATCH', `/api/v1/admin/app-versions/${unsigned!.id}/state`, { token: adminToken });
    expect(pin.status).toBe(400);
  });

  it('does not let an unsigned release take the latest flag', async () => {
    // Publishing an unsigned build (a CI run where signing failed) used to win
    // "latest" on semver alone. The feed skips unsigned releases, so every user
    // on that platform silently stopped being offered updates — including the
    // signed release that was working a minute earlier.
    const before = await inject('GET', '/api/v1/updates/windows/x86_64/8.0.0');
    expect(before.status, 'a signed release should be on offer to start with').toBe(200);
    const offered = (before.json as { version: string }).version;

    const res = await inject('POST', '/api/v1/admin/app-versions', {
      token: adminToken,
      body: {
        version: '9.9.0',
        platform: 'windows',
        channel: 'stable',
        downloadUrl: 'https://example.test/PCMAX-9.9.0.exe',
      },
    });
    expect(res.status).toBe(201);
    created.push('9.9.0');

    const after = await inject('GET', '/api/v1/updates/windows/x86_64/8.0.0');
    expect(after.status, 'updates must not go silent').toBe(200);
    expect((after.json as { version: string }).version).toBe(offered);
  });

  it('404s on an id that does not exist', async () => {
    const res = await inject('PATCH', '/api/v1/admin/app-versions/00000000-0000-4000-8000-000000000000/state', {
      token: adminToken,
    });
    expect(res.status).toBe(404);
  });

  it('stops offering a release once it is deleted', async () => {
    // Deleting the latest row must re-reconcile; otherwise no row is flagged
    // and the feed goes silent for everyone, or keeps naming a row that is gone.
    const listed = await inject('GET', '/api/v1/admin/app-versions', { token: adminToken });
    const top = ((listed.json.data ?? listed.json ?? []) as { id: string; version: string }[]).find(
      (v) => v.version === '9.1.0',
    );
    expect(top, 'expected the 9.1.0 row to exist').toBeDefined();
    await inject('DELETE', `/api/v1/admin/app-versions/${top!.id}`, { token: adminToken });
    created.splice(created.indexOf('9.1.0'), 1);

    const res = await inject('GET', '/api/v1/updates/windows/x86_64/8.0.0');
    expect(res.status).toBe(200);
    expect((res.json as { version: string }).version).toBe('9.0.5');
  });
});

/**
 * Retention deletes exhaust only. The dangerous failure is not "kept too much"
 * — it is deleting a live session (logging everyone out) or business data, so
 * that is what these assert.
 */
describe('data retention', () => {
  it('deletes aged exhaust but keeps live sessions, live codes and business data', async () => {
    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');
    const { runRetention } = await import('../lib/retention');

    const gamesBefore = ((await inject('GET', '/api/v1/games?limit=1')).json as { meta: { total: number } }).meta.total;

    // Old, already-consumed exhaust → must go.
    // ids are generated app-side by Drizzle, so raw SQL must supply them.
    await db.execute(sql`INSERT INTO otp_codes (id, email, purpose, code_hash, expires_at, attempts, used_at, created_at)
      VALUES (gen_random_uuid(),'old@test.local','register','x', now() - interval '400 days', 0, now() - interval '400 days', now() - interval '400 days')`);
    await db.execute(sql`INSERT INTO login_attempts (email, ip, success, attempted_at)
      VALUES ('old@test.local','127.0.0.1', false, now() - interval '400 days')`);

    // A LIVE, unused code that merely happens to be old-looking must survive:
    // it is not expired and not used.
    await db.execute(sql`INSERT INTO otp_codes (id, email, purpose, code_hash, expires_at, attempts, created_at)
      VALUES (gen_random_uuid(),'live@test.local','register','y', now() + interval '10 minutes', 0, now() - interval '400 days')`);

    const results = await runRetention();
    const deleted = Object.fromEntries(results.map((r) => [r.table, r.deleted]));

    expect(deleted.otp_codes, 'consumed code removed').toBeGreaterThanOrEqual(1);
    expect(deleted.login_attempts, 'old attempt removed').toBeGreaterThanOrEqual(1);
    for (const r of results) expect(r.deleted, `${r.table} must not error`).toBeGreaterThanOrEqual(0);

    const live = await db.execute(sql`SELECT count(*) n FROM otp_codes WHERE email = 'live@test.local'`);
    expect(Number((live.rows as { n: string }[])[0]!.n), 'live code survived').toBe(1);

    const gamesAfter = ((await inject('GET', '/api/v1/games?limit=1')).json as { meta: { total: number } }).meta.total;
    expect(gamesAfter, 'business data untouched').toBe(gamesBefore);

    await db.execute(sql`DELETE FROM otp_codes WHERE email = 'live@test.local'`);
  });
});

describe('admin API', () => {
  let token: string;

  it('logs in with the bootstrap admin', async () => {
    const res = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    expect(res.status).toBe(200);
    token = (res.json as { accessToken: string }).accessToken;
    expect(token).toBeTruthy();
  });

  it('rejects bad credentials', async () => {
    const res = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'WrongPass!' },
    });
    expect(res.status).toBe(401);
  });

  it('returns the admin profile with permissions', async () => {
    const res = await inject('GET', '/api/v1/admin/auth/me', { token });
    expect(res.status).toBe(200);
    const me = res.json as { role: string; permissions: string[] };
    expect(me.role).toBe('super_admin');
    expect(me.permissions).toContain('admins.manage');
  });

  it('requires auth on admin routes', async () => {
    const res = await inject('GET', '/api/v1/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('serves the dashboard with stats', async () => {
    const res = await inject('GET', '/api/v1/admin/dashboard', { token });
    expect(res.status).toBe(200);
    const stats = (res.json as { stats: { totalGames: number; totalProfiles: number } }).stats;
    expect(stats.totalGames).toBe(10);
    expect(stats.totalProfiles).toBe(40);
  });

  it('lets the admin add a game and the public API sees it immediately (no rebuild)', async () => {
    const create = await inject('POST', '/api/v1/admin/games', {
      token,
      body: {
        name: 'Cyberpunk 2077',
        slug: 'cyberpunk-2077',
        tagline: 'Wake up, samurai.',
        description: 'An open-world RPG in Night City.',
        developer: 'CD Projekt Red',
        publisher: 'CD Projekt',
        releaseDate: '2020-12-10',
        engine: 'REDengine 4',
        api: 'DirectX 12',
        technologies: { dlss: true, fsr: true, xess: true, ray_tracing: true, frame_generation: true },
        performanceRating: 88,
        status: 'published',
        featured: false,
        genreSlugs: ['action', 'rpg'],
        tagSlugs: ['singleplayer', 'story-rich'],
      },
    });
    expect(create.status).toBe(201);

    const search = await inject('GET', '/api/v1/games?q=cyberpunk');
    expect(search.status).toBe(200);
    expect((search.json.data as { slug: string }[]).some((g) => g.slug === 'cyberpunk-2077')).toBe(true);
  });

  it('creates a profile with settings, options and a new version', async () => {
    const games = (await inject('GET', '/api/v1/admin/games?q=cyberpunk', { token })).json.data as { id: string }[];
    const gameId = games[0]!.id;

    const profile = await inject('POST', `/api/v1/admin/games/${gameId}/profiles`, {
      token,
      body: { slug: 'balanced', name: 'Balanced', description: '60 FPS target', targetFps: 60, hardwareTier: 'mid_range', isDefault: true },
    });
    expect(profile.status).toBe(201);
    const profileId = (profile.json as { id: string }).id;

    const setting = await inject('POST', `/api/v1/admin/profiles/${profileId}/settings`, {
      token,
      body: { key: 'texture-quality', name: 'Texture Quality', type: 'select', value: 'High', categorySlug: 'graphics', sortOrder: 0 },
    });
    expect(setting.status).toBe(201);
    const settingId = (setting.json as { id: string }).id;

    const option = await inject('POST', `/api/v1/admin/settings/${settingId}/options`, {
      token,
      body: { value: 'High', label: 'High', isRecommended: true, sortOrder: 0 },
    });
    expect(option.status).toBe(201);

    const publish = await inject('POST', `/api/v1/admin/profiles/${profileId}/publish`, {
      token,
      body: { status: 'published' },
    });
    expect(publish.status).toBe(200);

    const bump = await inject('POST', `/api/v1/admin/profiles/${profileId}/versions`, {
      token,
      body: { changeNote: 'Texture tweaks' },
    });
    expect(bump.status).toBe(200);
    expect((bump.json as { version: string }).version).toBe('1.0.1');

    const publicProfile = await inject('GET', '/api/v1/games/cyberpunk-2077/optimizations/balanced');
    expect(publicProfile.status).toBe(200);
    const data = publicProfile.json as { version: string; settings: { name: string; options: unknown[] }[] };
    expect(data.version).toBe('1.0.1');
    expect(data.settings[0]!.name).toBe('Texture Quality');
    expect(data.settings[0]!.options.length).toBe(1);
  });

  it('enforces RBAC for viewer role', async () => {
    const created = await inject('POST', '/api/v1/admin/admins', {
      token,
      body: { email: 'viewer@test.local', name: 'Viewer', password: 'ViewerPass123!', role: 'viewer' },
    });
    expect(created.status).toBe(201);

    const login = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'viewer@test.local', password: 'ViewerPass123!' },
    });
    const viewerToken = (login.json as { accessToken: string }).accessToken;

    const read = await inject('GET', '/api/v1/admin/dashboard', { token: viewerToken });
    expect(read.status).toBe(200);

    const write = await inject('POST', '/api/v1/admin/games', {
      token: viewerToken,
      body: { name: 'Nope', slug: 'nope' },
    });
    expect(write.status).toBe(403);
  });

  it('records audit log entries', async () => {
    const res = await inject('GET', '/api/v1/admin/audit-logs?limit=100', { token });
    expect(res.status).toBe(200);
    const rows = res.json.data as { action: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.action === 'game.create')).toBe(true);
  });
});

describe('edge cases', () => {
  let token: string;

  beforeAll(async () => {
    const login = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    token = (login.json as { accessToken: string }).accessToken;
  });

  it('rejects malformed input with 400 (slug format, tech flags, page)', async () => {
    const badSlug = await inject('POST', '/api/v1/admin/games', {
      token,
      body: { name: 'Bad Slug', slug: 'Not A Slug!' },
    });
    expect(badSlug.status).toBe(400);

    const badTech = await inject('GET', '/api/v1/games?techs=nope');
    expect(badTech.status).toBe(400);

    const badPage = await inject('GET', '/api/v1/games?page=0');
    expect(badPage.status).toBe(400);

    const badPresign = await inject('POST', '/api/v1/admin/uploads/presign', {
      token,
      body: { kind: 'cover', contentType: 'image/gif', size: 5 * 1024 * 1024 },
    });
    expect(badPresign.status).toBe(400);
  });

  it('hides draft and archived games from the public API', async () => {
    const create = await inject('POST', '/api/v1/admin/games', {
      token,
      body: { name: 'Draft Game', slug: 'draft-game', status: 'draft' },
    });
    expect(create.status).toBe(201);

    const pub = await inject('GET', '/api/v1/games/draft-game');
    expect(pub.status).toBe(404);

    const list = await inject('GET', '/api/v1/games?q=draft-game');
    expect((list.json.data as unknown[]).length).toBe(0);

    const sync = await inject('GET', '/api/v1/sync');
    expect((sync.json.games as { slug: string }[]).some((g) => g.slug === 'draft-game')).toBe(false);
  });

  it('counts views transactionally', async () => {
    const game = (await inject('GET', '/api/v1/games/gta-v')).json as { id: string; viewCount: number };
    for (let i = 0; i < 3; i++) {
      const res = await inject('POST', '/api/v1/views', {
        body: { deviceId: 'edge-device-views', gameId: game.id },
      });
      expect(res.status).toBe(200);
    }
    const after = (await inject('GET', '/api/v1/games/gta-v')).json as { viewCount: number };
    expect(after.viewCount).toBe(game.viewCount + 3);
  });

  it('rotates refresh tokens (old token cannot be reused)', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: JSON.stringify({ email: 'admin@test.local', password: 'TestPass123!' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === 'goh_refresh');
    expect(cookie).toBeTruthy();

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/refresh',
      headers: { cookie: `goh_refresh=${cookie!.value}` },
    });
    expect(refresh.statusCode).toBe(200);

    // Reusing the now-rotated token must fail.
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/refresh',
      headers: { cookie: `goh_refresh=${cookie!.value}` },
    });
    expect(reuse.statusCode).toBe(401);
  });

  it('paginates and sorts the library without overlap', async () => {
    const page1 = (await inject('GET', '/api/v1/games?limit=5&page=1&sort=name')).json as { data: { slug: string }[] };
    const page2 = (await inject('GET', '/api/v1/games?limit=5&page=2&sort=name')).json as { data: { slug: string }[] };
    expect(page1.data).toHaveLength(5);
    expect(page2.data).toHaveLength(5);
    const slugs = [...page1.data, ...page2.data].map((g) => g.slug);
    expect(new Set(slugs).size).toBe(10);
    expect([...slugs].sort()).toEqual(slugs);
  });

  it('sync manifests include profiles changed after a version bump', async () => {
    const before = (await inject('GET', '/api/v1/sync')).json as { contentUpdatedAt: string | null };
    expect(before.contentUpdatedAt).not.toBeNull();

    const gta = ((await inject('GET', '/api/v1/admin/games?q=gta', { token })).json.data as { id: string }[])[0]!;
    const profiles = ((await inject('GET', `/api/v1/admin/games/${gta.id}/profiles`, { token })).json.data as { id: string }[]);
    const bump = await inject('POST', `/api/v1/admin/profiles/${profiles[0]!.id}/versions`, {
      token,
      body: { changeNote: 'edge-case sync test' },
    });
    expect(bump.status).toBe(200);

    const after = (await inject('GET', `/api/v1/sync?since=${encodeURIComponent(before.contentUpdatedAt!)}`)).json as {
      profiles: { slug: string; deleted: boolean }[];
    };
    expect(after.profiles.some((p) => !p.deleted)).toBe(true);
  });

  it('archives a profile → hidden from the public API, shown in sync as deleted', async () => {
    const gta = ((await inject('GET', '/api/v1/admin/games?q=gta', { token })).json.data as { id: string }[])[0]!;
    const profiles = ((await inject('GET', `/api/v1/admin/games/${gta.id}/profiles`, { token })).json.data as {
      id: string;
      slug: string;
    }[]);
    const target = profiles.find((p) => p.slug !== 'balanced') ?? profiles[0]!;
    const since = ((await inject('GET', '/api/v1/sync')).json as { contentUpdatedAt: string }).contentUpdatedAt;
    await inject('POST', `/api/v1/admin/profiles/${target.id}/publish`, { token, body: { status: 'archived' } });

    const list = (await inject('GET', '/api/v1/games/gta-v/optimizations')).json as { data: { slug: string }[] };
    expect(list.data.some((p) => p.slug === target.slug)).toBe(false);

    const sync = (await inject('GET', `/api/v1/sync?since=${encodeURIComponent(since)}`)).json as { profiles: { slug: string; deleted: boolean }[] };
    expect(sync.profiles.some((p) => p.slug === target.slug && p.deleted)).toBe(true);
  });
});

describe('user accounts & auth (email + OTP)', () => {
  let token: string;
  let userId: string;
  const email = 'accounttest@example.test';
  const password = 'StrongPass123!';

  beforeAll(async () => {
    const reg = await registerUser(email, password, 'accounttest');
    expect(reg.status).toBe(201);
    token = (reg.json as { accessToken: string }).accessToken;
    userId = (reg.json as { user: { id: string } }).user.id;
  });

  it('serves the profile from the access token', async () => {
    const me = await inject('GET', '/api/v1/auth/me', { token });
    expect(me.status).toBe(200);
    expect((me.json as { email: string }).email).toBe(email);
    expect((me.json as { emailVerified: boolean }).emailVerified).toBe(true);
    // Phone auth is disabled, so a fresh account never carries one.
    expect((me.json as { phone: string | null }).phone).toBeNull();
  });

  it('normalizes case and surrounding whitespace to the same account', async () => {
    for (const variant of ['  accounttest@example.test  ', 'AccountTest@Example.TEST', 'ACCOUNTTEST@EXAMPLE.TEST']) {
      const login = await inject('POST', '/api/v1/auth/login', { body: { identifier: variant, password } });
      expect(login.status, `variant ${JSON.stringify(variant)}`).toBe(200);
    }
  });

  it('refuses a phone number as an identifier', async () => {
    // Phone authentication is disabled: these must not reach a lookup at all.
    for (const phoneish of ['+989121112233', '09121112233', '989121112233']) {
      const login = await inject('POST', '/api/v1/auth/login', { body: { identifier: phoneish, password } });
      expect(login.status, `login ${phoneish}`).toBe(400);
      const otp = await inject('POST', '/api/v1/auth/otp/send', { body: { identifier: phoneish, purpose: 'register' } });
      expect(otp.status, `otp ${phoneish}`).toBe(400);
    }
  });

  it('rejects duplicate registration (same email, any casing)', async () => {
    // The duplicate check runs BEFORE OTP verification server-side, so no fresh
    // OTP is needed here (requesting one would also trip the resend cooldown).
    const dup = await inject('POST', '/api/v1/auth/register', {
      body: { identifier: 'AccountTest@Example.TEST', username: 'accounttest2', password, otp: '000000' },
    });
    expect(dup.status).toBe(409);
  });

  it('rejects registration with a wrong OTP', async () => {
    await requestOtp('badotp@example.test', 'register');
    const bad = await inject('POST', '/api/v1/auth/register', {
      body: { identifier: 'badotp@example.test', username: 'badotp', password, otp: '000000' },
    });
    expect(bad.status).toBe(400);
  });

  it('logs in and refreshes with rotation', async () => {
    const login = await inject('POST', '/api/v1/auth/login', { body: { identifier: email, password } });
    expect(login.status).toBe(200);

    const cookie = (await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: JSON.stringify({ identifier: email, password }),
      headers: { 'content-type': 'application/json' },
    })).cookies.find((c) => c.name === 'goh_user_refresh');
    expect(cookie).toBeTruthy();

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: `goh_user_refresh=${cookie!.value}` },
    });
    expect(refresh.statusCode).toBe(200);

    // Old (rotated) refresh token must be rejected.
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: `goh_user_refresh=${cookie!.value}` },
    });
    expect(reuse.statusCode).toBe(401);
  });

  it('locks the account after repeated failed logins', async () => {
    for (let i = 0; i < 5; i++) {
      const bad = await inject('POST', '/api/v1/auth/login', {
        body: { identifier: email, password: 'WrongPass!' },
      });
      expect(bad.status).toBe(401);
    }
    const locked = await inject('POST', '/api/v1/auth/login', {
      body: { identifier: email, password },
    });
    expect(locked.status).toBe(429);
    expect((locked.json.error as { code: string }).code).toBe('ACCOUNT_LOCKED');
  });

  it('resets the password via OTP and invalidates old sessions', async () => {
    const forgot = await inject('POST', '/api/v1/auth/password/forgot', { body: { identifier: email } });
    expect(forgot.status).toBe(200);
    const otp = (forgot.json as { devCode?: string }).devCode;
    expect(otp).toBeTruthy();

    // A token issued BEFORE the reset must die with it (token-version bump).
    const preResetLogin = await inject('POST', '/api/v1/auth/login', {
      body: { identifier: email, password: 'StrongPass123!' },
    });
    const preResetToken = (preResetLogin.json as { accessToken: string }).accessToken;

    const reset = await inject('POST', '/api/v1/auth/password/reset', {
      body: { identifier: email, otp: otp!, newPassword: 'NewStrongPass456!' },
    });
    expect(reset.status).toBe(200);

    const meWithOldToken = await inject('GET', '/api/v1/auth/me', { token: preResetToken });
    expect(meWithOldToken.status).toBe(401);

    const oldPass = await inject('POST', '/api/v1/auth/login', {
      body: { identifier: email, password: 'StrongPass123!' },
    });
    expect(oldPass.status).toBe(401);

    const newPass = await inject('POST', '/api/v1/auth/login', {
      body: { identifier: email, password: 'NewStrongPass456!' },
    });
    expect(newPass.status).toBe(200);

    // OTP reuse must fail.
    const reuse = await inject('POST', '/api/v1/auth/password/reset', {
      body: { identifier: email, otp: otp!, newPassword: 'AnotherPass789!' },
    });
    expect(reuse.status).toBe(400);
  });

  it('registers and logs in with an EMAIL identifier (unified login)', async () => {
    const email = 'gamer@example.com';
    const otp = await requestOtp(email, 'register');
    const reg = await inject('POST', '/api/v1/auth/register', {
      body: { identifier: email, username: 'emailgamer', password: 'EmailPass123!', otp },
    });
    expect(reg.status).toBe(201);
    const user = (reg.json as { user: { email: string; phone: string | null; emailVerified: boolean } }).user;
    expect(user.email).toBe(email);
    expect(user.phone).toBeNull();
    expect(user.emailVerified).toBe(true);

    const login = await inject('POST', '/api/v1/auth/login', { body: { identifier: email, password: 'EmailPass123!' } });
    expect(login.status).toBe(200);

    // Email normalization: uppercase + whitespace resolve to the same account.
    const normLogin = await inject('POST', '/api/v1/auth/login', {
      body: { identifier: '  GAMER@Example.COM ', password: 'EmailPass123!' },
    });
    expect(normLogin.status).toBe(200);
  });

  it('rejects duplicate email registration and invalid identifiers', async () => {
    const dup = await inject('POST', '/api/v1/auth/register', {
      body: { identifier: 'gamer@example.com', username: 'emailgamer2', password: 'EmailPass123!', otp: '000000' },
    });
    expect(dup.status).toBe(409);

    const invalidEmail = await inject('POST', '/api/v1/auth/otp/send', { body: { identifier: 'not-an-email', purpose: 'register' } });
    expect(invalidEmail.status).toBe(400);
    const invalidPhone = await inject('POST', '/api/v1/auth/otp/send', { body: { identifier: 'abc', purpose: 'register' } });
    expect(invalidPhone.status).toBe(400);
    const badLogin = await inject('POST', '/api/v1/auth/login', { body: { identifier: '???', password: 'x' } });
    expect(badLogin.status).toBe(400);
  });

  it('resets a password by EMAIL with OTP and kills old access tokens', async () => {
    const email = 'resetme@example.com';
    const otp = await requestOtp(email, 'register');
    await inject('POST', '/api/v1/auth/register', {
      body: { identifier: email, username: 'resetgamer', password: 'FirstPass123!', otp },
    });
    const preLogin = await inject('POST', '/api/v1/auth/login', { body: { identifier: email, password: 'FirstPass123!' } });
    expect(preLogin.status).toBe(200);
    const oldToken = (preLogin.json as { accessToken: string }).accessToken;

    // Forgot-password accepts the same unified identifier (no enumeration).
    const forgot = await inject('POST', '/api/v1/auth/password/forgot', { body: { identifier: email } });
    expect(forgot.status).toBe(200);
    expect((forgot.json as { devCode?: string }).devCode).toBeTruthy();
    const resetCode = (forgot.json as { devCode: string }).devCode;

    const reset = await inject('POST', '/api/v1/auth/password/reset', {
      body: { identifier: email, otp: resetCode, newPassword: 'SecondPass456!' },
    });
    expect(reset.status).toBe(200);

    // Old access token dies with the reset.
    const meOld = await inject('GET', '/api/v1/auth/me', { token: oldToken });
    expect(meOld.status).toBe(401);

    // Old password dead, new password works.
    const oldPass = await inject('POST', '/api/v1/auth/login', { body: { identifier: email, password: 'FirstPass123!' } });
    expect(oldPass.status).toBe(401);
    const newPass = await inject('POST', '/api/v1/auth/login', { body: { identifier: email, password: 'SecondPass456!' } });
    expect(newPass.status).toBe(200);

    // Forgot for an unknown identifier still succeeds with a decoy code.
    const decoy = await inject('POST', '/api/v1/auth/password/forgot', { body: { identifier: 'nobody@example.com' } });
    expect(decoy.status).toBe(200);
  });

  it('suspends a user → login and existing tokens stop working', async () => {
    // Re-login first (previous test changed the password; lockout cleared on success).
    const login = await inject('POST', '/api/v1/auth/login', {
      body: { identifier: email, password: 'NewStrongPass456!' },
    });
    const freshToken = (login.json as { accessToken: string }).accessToken;

    const adminLogin = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    const adminToken = (adminLogin.json as { accessToken: string }).accessToken;

    const suspend = await inject('PATCH', `/api/v1/admin/users/${userId}`, {
      token: adminToken,
      body: { status: 'suspended' },
    });
    expect(suspend.status).toBe(200);

    const me = await inject('GET', '/api/v1/auth/me', { token: freshToken });
    expect(me.status).toBe(403);

    const loginSuspended = await inject('POST', '/api/v1/auth/login', {
      body: { identifier: email, password: 'NewStrongPass456!' },
    });
    expect(loginSuspended.status).toBe(401);

    // Restore for later suites.
    await inject('PATCH', `/api/v1/admin/users/${userId}`, { token: adminToken, body: { status: 'active' } });
  });

  it('enforces admin permissions (viewer cannot read users)', async () => {
    const adminLogin = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    const adminToken = (adminLogin.json as { accessToken: string }).accessToken;
    const list = await inject('GET', '/api/v1/admin/users', { token: adminToken });
    expect(list.status).toBe(200);
    expect((list.json.data as unknown[]).length).toBeGreaterThan(0);

    const createViewer = await inject('POST', '/api/v1/admin/admins', {
      token: adminToken,
      body: { email: 'viewer2@test.local', name: 'Viewer', password: 'ViewerPass123!', role: 'viewer' },
    });
    expect(createViewer.status).toBe(201);

    const viewerLogin = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'viewer2@test.local', password: 'ViewerPass123!' },
    });
    const viewerToken = (viewerLogin.json as { accessToken: string }).accessToken;

    // Viewers may read users but cannot modify them.
    const canRead = await inject('GET', '/api/v1/admin/users', { token: viewerToken });
    expect(canRead.status).toBe(200);
    const denied = await inject('PATCH', `/api/v1/admin/users/${userId}`, {
      token: viewerToken,
      body: { status: 'suspended' },
    });
    expect(denied.status).toBe(403);
  });
});

describe('favorites (persistent, user-specific)', () => {
  const email = 'user000008@example.test';
  let token: string;
  let otherToken: string;
  let gameId: string;

  beforeAll(async () => {
    const reg = await registerUser(email, 'FavPass123!', 'favuser');
    token = (reg.json as { accessToken: string }).accessToken;
    const other = await registerUser('user000009@example.test', 'FavPass123!', 'favother');
    otherToken = (other.json as { accessToken: string }).accessToken;
    const games = (await inject('GET', '/api/v1/games?q=dying-light')).json as { data: { id: string }[] };
    gameId = games.data[0]!.id;
  });

  it('adds, lists and removes favorites', async () => {
    const add = await inject('PUT', `/api/v1/favorites/${gameId}`, { token });
    expect(add.status).toBe(200);
    expect((add.json as { favorited: boolean }).favorited).toBe(true);

    const list = (await inject('GET', '/api/v1/favorites', { token })).json as { data: { id: string }[] };
    expect(list.data.some((g) => g.id === gameId)).toBe(true);

    // Idempotent duplicate add → still one row.
    await inject('PUT', `/api/v1/favorites/${gameId}`, { token });
    const again = (await inject('GET', '/api/v1/favorites', { token })).json as { data: unknown[] };
    expect(again.data.filter((g) => (g as { id: string }).id === gameId).length).toBe(1);

    const remove = await inject('DELETE', `/api/v1/favorites/${gameId}`, { token });
    expect(remove.status).toBe(200);
    expect((remove.json as { favorited: boolean }).favorited).toBe(false);

    const after = (await inject('GET', '/api/v1/favorites', { token })).json as { data: { id: string }[] };
    expect(after.data.some((g) => g.id === gameId)).toBe(false);
  });

  it('favorites are user-specific (no cross-user leakage)', async () => {
    await inject('PUT', `/api/v1/favorites/${gameId}`, { token });
    const mine = (await inject('GET', '/api/v1/favorites', { token })).json as { data: { id: string }[] };
    const others = (await inject('GET', '/api/v1/favorites', { token: otherToken })).json as { data: { id: string }[] };
    expect(mine.data.some((g) => g.id === gameId)).toBe(true);
    expect(others.data.some((g) => g.id === gameId)).toBe(false);
    await inject('DELETE', `/api/v1/favorites/${gameId}`, { token });
  });

  it('rejects favoriting an unknown game', async () => {
    const res = await inject('PUT', '/api/v1/favorites/00000000-0000-4000-8000-000000000000', { token });
    expect(res.status).toBe(404);
  });
});

/**
 * Both gated areas do their work on the user's own machine, so the server
 * cannot withhold the *execution* — what it withholds is authorisation and the
 * payload. These assert the server says no on its own, without the client
 * having to ask nicely.
 */
/**
 * Every desktop launch registers an anonymous device row, so the users table
 * holds one per install on top of the real accounts. Counting rows reported
 * roughly double the real figure on the admin dashboard — and now that
 * sign-in is required, a device row on its own is not a user anyone can reach.
 */
describe('admin user metrics', () => {
  let adminToken: string;

  beforeAll(async () => {
    const login = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    adminToken = (login.json as { accessToken: string }).accessToken;
  });

  it('counts accounts, not anonymous device registrations', async () => {
    const before = ((await inject('GET', '/api/v1/admin/dashboard', { token: adminToken })).json as {
      stats: { totalUsers: number };
    }).stats.totalUsers;

    // A device registration creates a users row with no email.
    const res = await inject('POST', '/api/v1/users/device', {
      body: { deviceId: 'metrics-probe-device-01', platform: 'windows' },
    });
    expect(res.status).toBe(200);

    const after = ((await inject('GET', '/api/v1/admin/dashboard', { token: adminToken })).json as {
      stats: { totalUsers: number };
    }).stats.totalUsers;

    expect(after, 'an install is not a user').toBe(before);
  });

  it('still counts a real registration', async () => {
    const before = ((await inject('GET', '/api/v1/admin/dashboard', { token: adminToken })).json as {
      stats: { totalUsers: number };
    }).stats.totalUsers;

    await registerUser('metrics-probe@example.test', 'MetricsPass123!', 'metricsprobe');

    const after = ((await inject('GET', '/api/v1/admin/dashboard', { token: adminToken })).json as {
      stats: { totalUsers: number };
    }).stats.totalUsers;

    expect(after, 'a real account must be counted').toBe(before + 1);
  });
});

describe('subscription gate (Multi-Frame Generation & Windows Optimizer)', () => {
  let userToken: string;
  let userId: string;
  let adminToken: string;

  beforeAll(async () => {
    const reg = await registerUser('gatetest@example.test', 'GatePass123!', 'gatetest');
    userToken = (reg.json as { accessToken: string }).accessToken;
    userId = (reg.json as { user: { id: string } }).user.id;
    const adminLogin = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    adminToken = (adminLogin.json as { accessToken: string }).accessToken;
  });

  it('reports both features locked for a user with no subscription', async () => {
    const res = await inject('GET', '/api/v1/me/features', { token: userToken });
    expect(res.status).toBe(200);
    const { features } = res.json as { features: Record<string, boolean> };
    expect(features.multi_frame_generation).toBe(false);
    expect(features.windows_optimizer).toBe(false);
  });

  it('refuses to authorize either feature without a subscription', async () => {
    for (const feature of ['multi_frame_generation', 'windows_optimizer']) {
      const res = await inject('POST', `/api/v1/me/features/${feature}/authorize`, { token: userToken });
      expect(res.status, feature).toBe(403);
    }
  });

  it('requires authentication, not just a subscription', async () => {
    // No token at all must not fall through to the entitlement check.
    expect((await inject('GET', '/api/v1/me/features')).status).toBe(401);
    expect((await inject('POST', '/api/v1/me/features/windows_optimizer/authorize')).status).toBe(401);
  });

  it('rejects an unknown feature name rather than defaulting open', async () => {
    const res = await inject('POST', '/api/v1/me/features/some_other_thing/authorize', { token: userToken });
    expect(res.status).toBe(400);
  });

  it('unlocks both once an admin grants a subscription, and locks them again when it is revoked', async () => {
    const plans = (await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { id: string }[] };
    const grant = await inject('POST', '/api/v1/admin/payments/manual-grant', {
      token: adminToken,
      body: { userId, planId: plans.data[0]!.id },
    });
    expect(grant.status).toBe(200);
    const subscriptionId = (grant.json as { subscriptionId: string }).subscriptionId;

    const unlocked = (await inject('GET', '/api/v1/me/features', { token: userToken })).json as {
      features: Record<string, boolean>;
    };
    expect(unlocked.features.multi_frame_generation).toBe(true);
    expect(unlocked.features.windows_optimizer).toBe(true);

    for (const feature of ['multi_frame_generation', 'windows_optimizer']) {
      const res = await inject('POST', `/api/v1/me/features/${feature}/authorize`, { token: userToken });
      expect(res.status, feature).toBe(200);
    }

    // Cancelling must take access away immediately — no grace window where the
    // entitlement row outlives the subscription.
    const cancel = await inject('PATCH', `/api/v1/admin/subscriptions/${subscriptionId}`, {
      token: adminToken,
      body: { status: 'cancelled' },
    });
    expect(cancel.status).toBe(200);

    const relocked = (await inject('GET', '/api/v1/me/features', { token: userToken })).json as {
      features: Record<string, boolean>;
    };
    expect(relocked.features.multi_frame_generation).toBe(false);
    expect(relocked.features.windows_optimizer).toBe(false);
    expect((await inject('POST', '/api/v1/me/features/windows_optimizer/authorize', { token: userToken })).status).toBe(403);
  });
});

describe('subscriptions & payments (Phase 5-6)', () => {
  let adminToken: string;
  let userToken: string;
  let userId: string;
  let planId: string;
  let paymentId: string;

  beforeAll(async () => {
    const adminLogin = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    adminToken = (adminLogin.json as { accessToken: string }).accessToken;

    const reg = await registerUser('user000001@example.test', 'SubPass123!', 'substest');
    userToken = (reg.json as { accessToken: string }).accessToken;
    userId = (reg.json as { user: { id: string } }).user.id;
  });

  it('serves the seeded plans publicly', async () => {
    const plans = await inject('GET', '/api/v1/subscriptions/plans');
    expect(plans.status).toBe(200);
    const data = (plans.json as { data: { slug: string; price: number }[] }).data;
    expect(data.length).toBe(4);
    expect(data.map((p) => p.slug)).toEqual(['1-month', '3-months', '6-months', '12-months']);
    const fresh = (await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { id: string }[] };
    planId = fresh.data[0]!.id;
  });

  it('creates a plan in the admin and it appears in the public storefront', async () => {
    const create = await inject('POST', '/api/v1/admin/subscriptions/plans', {
      token: adminToken,
      body: {
        name: '2 Weeks Trial',
        slug: '2-weeks-trial',
        durationDays: 14,
        price: 99_000,
        currency: 'IRR',
        deviceLimit: 1,
        features: ['premium_optimization'],
        status: 'active',
        sortOrder: 0,
      },
    });
    expect(create.status).toBe(201);

    const pub = (await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { slug: string }[] };
    expect(pub.data.some((p) => p.slug === '2-weeks-trial')).toBe(true);
  });

  it('purchases with the mock provider and activates only after server-side verification', async () => {
    const purchase = await inject('POST', '/api/v1/subscriptions/purchase', {
      token: userToken,
      body: { planId, idempotencyKey: 'subs-test-key-0001' },
    });
    expect(purchase.status).toBe(200);
    const res = purchase.json as { paymentId: string; redirectUrl: string; status: string };
    expect(res.redirectUrl).toContain('/api/v1/payments/mock/callback');
    paymentId = res.paymentId;

    // Not active until the callback verifies.
    const before = (await inject('GET', '/api/v1/me/subscription', { token: userToken })).json as { isActive: boolean };
    expect(before.isActive).toBe(false);

    const callback = await inject('POST', '/api/v1/payments/mock/callback', {
      body: { paymentId },
    });
    expect(callback.status).toBe(200);
    expect((callback.json as { ok: boolean }).ok).toBe(true);

    const after = (await inject('GET', '/api/v1/me/subscription', { token: userToken })).json as {
      isActive: boolean;
      entitlements: { feature: string }[];
    };
    expect(after.isActive).toBe(true);
    expect(after.entitlements.map((e) => e.feature)).toContain('premium_optimization');
  });

  it('is idempotent — same idempotency key returns the same payment, double callback is harmless', async () => {
    const again = await inject('POST', '/api/v1/subscriptions/purchase', {
      token: userToken,
      body: { planId, idempotencyKey: 'subs-test-key-0001' },
    });
    expect(again.status).toBe(200);
    expect((again.json as { paymentId: string }).paymentId).toBe(paymentId);

    const repeatCallback = await inject('POST', '/api/v1/payments/mock/callback', {
      body: { paymentId },
    });
    expect(repeatCallback.status).toBe(200);
    expect((repeatCallback.json as { ok: boolean }).ok).toBe(true);
  });

  it('enforces the device limit from the active plan', async () => {
    const first = await inject('POST', '/api/v1/me/devices', {
      token: userToken,
      body: { deviceId: 'device-one-0000000000000001', name: 'PC 1' },
    });
    expect(first.status).toBe(201);

    // Plan is 1-month (deviceLimit 1) → second device rejected.
    const second = await inject('POST', '/api/v1/me/devices', {
      token: userToken,
      body: { deviceId: 'device-two-0000000000000002', name: 'PC 2' },
    });
    expect(second.status).toBe(409);
    expect((second.json.error as { code: string }).code).toBe('CONFLICT');

    // Upgrade to 6-months (deviceLimit 2) → the second slot opens up.
    const sixMonth = ((await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { slug: string; id: string }[] }).data.find(
      (p) => p.slug === '6-months',
    )!;
    const purchase = await inject('POST', '/api/v1/subscriptions/purchase', {
      token: userToken,
      body: { planId: sixMonth.id, idempotencyKey: 'subs-test-key-0002' },
    });
    const pid = (purchase.json as { paymentId: string }).paymentId;
    await inject('POST', '/api/v1/payments/mock/callback', { body: { paymentId: pid } });

    const secondRetry = await inject('POST', '/api/v1/me/devices', {
      token: userToken,
      body: { deviceId: 'device-two-0000000000000002', name: 'PC 2' },
    });
    expect(secondRetry.status).toBe(201);

    // Both slots used → third is rejected.
    const third = await inject('POST', '/api/v1/me/devices', {
      token: userToken,
      body: { deviceId: 'device-three-0000000000000003', name: 'PC 3' },
    });
    expect(third.status).toBe(409);

    // Revoking frees a slot.
    const devicesList = (await inject('GET', '/api/v1/me/devices', { token: userToken })).json as { data: { id: string }[] };
    const target = devicesList.data[0]!;
    const revoke = await inject('DELETE', `/api/v1/me/devices/${target.id}`, { token: userToken });
    expect(revoke.status).toBe(200);

    const fourth = await inject('POST', '/api/v1/me/devices', {
      token: userToken,
      body: { deviceId: 'device-four-0000000000000004', name: 'PC 4' },
    });
    expect(fourth.status).toBe(201);
  });

  it('lets admins extend and cancel subscriptions', async () => {
    const list = (await inject('GET', '/api/v1/admin/subscriptions', { token: adminToken })).json as {
      data: { id: string; expirationDate: string; userEmail: string }[];
    };
    const anyActive = list.data.find((s) => s.userEmail === 'user000001@example.test')!;
    const before = new Date(anyActive.expirationDate).getTime();

    const extend = await inject('PATCH', `/api/v1/admin/subscriptions/${anyActive.id}`, {
      token: adminToken,
      body: { extendDays: 30 },
    });
    expect(extend.status).toBe(200);
    const after = new Date((extend.json as { expirationDate: string }).expirationDate).getTime();
    expect(after).toBeGreaterThan(before);

    const cancel = await inject('PATCH', `/api/v1/admin/subscriptions/${anyActive.id}`, {
      token: adminToken,
      body: { status: 'cancelled' },
    });
    expect(cancel.status).toBe(200);
  });

  it('lets admins grant a manual subscription (support flow)', async () => {
    const plan = ((await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { id: string }[] }).data[1]!;
    const grant = await inject('POST', '/api/v1/admin/payments/manual-grant', {
      token: adminToken,
      body: { userId, planId: plan.id, durationDays: 7 },
    });
    expect(grant.status).toBe(200);

    const me = (await inject('GET', '/api/v1/me/subscription', { token: userToken })).json as { isActive: boolean };
    expect(me.isActive).toBe(true);
  });

  it('lists payments in the admin panel with user + plan context', async () => {
    const list = (await inject('GET', '/api/v1/admin/payments', { token: adminToken })).json as {
      data: { userEmail: string; status: string; planName: string }[];
    };
    expect(list.data.length).toBeGreaterThan(0);
    const mine = list.data.find((p) => p.userEmail === 'user000001@example.test');
    expect(mine?.status).toBe('paid');
  });
});

describe('optimization packages & compatibility (Phase 9-11)', () => {
  let adminToken: string;
  let premiumToken: string;
  let freeToken: string;
  let gameId: string;
  let pkgId: string;

  beforeAll(async () => {
    const adminLogin = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    adminToken = (adminLogin.json as { accessToken: string }).accessToken;

    // Premium user (active subscription).
    const reg = await registerUser('user000002@example.test', 'PkgPass123!', 'pkgpremium');
    premiumToken = (reg.json as { accessToken: string }).accessToken;
    const plans = (await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { id: string }[] };
    const purchase = await inject('POST', '/api/v1/subscriptions/purchase', {
      token: premiumToken,
      body: { planId: plans.data[0]!.id, idempotencyKey: 'pkg-suite-0001' },
    });
    const pid = (purchase.json as { paymentId: string }).paymentId;
    await inject('POST', '/api/v1/payments/mock/callback', { body: { paymentId: pid } });

    // Free user.
    const freeReg = await registerUser('user000003@example.test', 'PkgPass123!', 'pkgfree');
    freeToken = (freeReg.json as { accessToken: string }).accessToken;

    // A game to attach packages to.
    const game = (await inject('GET', '/api/v1/games?q=dying-light')).json as { data: { id: string; slug: string }[] };
    gameId = game.data[0]!.id;
  });

  it('creates a draft package, hidden from the public storefront', async () => {
    const create = await inject('POST', '/api/v1/admin/packages', {
      token: adminToken,
      body: {
        gameId,
        name: 'NVIDIA RTX 30 High FPS',
        slug: 'rtx30-high-fps',
        gpuVendor: 'nvidia',
        gpuFamily: 'rtx 30',
        minVramMb: 4096,
        minRamGb: 8,
        minWindows: '10.0.19041',
        targetResolution: '1080p',
        targetFps: 60,
      },
    });
    expect(create.status).toBe(201);
    pkgId = (create.json as { id: string }).id;

    const publicList = (await inject('GET', '/api/v1/games/dying-light/packages')).json as { data: unknown[] };
    expect(publicList.data.length).toBe(0);
  });

  it('rejects unsafe files (executables, path traversal)', async () => {
    const presignExe = await inject('POST', `/api/v1/admin/packages/${pkgId}/files/presign`, {
      token: adminToken,
      body: { filename: 'evil.exe', size: 100 },
    });
    expect(presignExe.status).toBe(400);

    const presign = await inject('POST', `/api/v1/admin/packages/${pkgId}/files/presign`, {
      token: adminToken,
      body: { filename: 'settings.cfg', size: 64 },
    });
    expect(presign.status).toBe(200);
    const { objectKey } = presign.json as { objectKey: string };

    const badDest = await inject('POST', `/api/v1/admin/packages/${pkgId}/files/complete`, {
      token: adminToken,
      body: { storageKey: objectKey, filename: 'settings.cfg', size: 64, destination: '../../evil', operation: 'replace' },
    });
    expect(badDest.status).toBe(400);
  });

  it('uploads a file and computes the SHA-256 server-side', async () => {
    const content = Buffer.from('dummy optimization config v1\n');
    const presign = (await inject('POST', `/api/v1/admin/packages/${pkgId}/files/presign`, {
      token: adminToken,
      body: { filename: 'settings.cfg', size: content.length },
    })).json as { uploadUrl: string; objectKey: string };
    const key = presign.uploadUrl.split('/api/v1/uploads/packages/put/')[1]!;

    const put = await app.inject({
      method: 'PUT',
      url: `/api/v1/uploads/packages/put/${key}`,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(content.length) },
      payload: content,
    });
    expect(put.statusCode).toBe(201);

    const complete = await inject('POST', `/api/v1/admin/packages/${pkgId}/files/complete`, {
      token: adminToken,
      body: { storageKey: presign.objectKey, filename: 'settings.cfg', size: content.length, destination: 'Profiles/settings.cfg', operation: 'replace' },
    });
    expect(complete.status).toBe(200);

    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update(content).digest('hex');
    expect((complete.json as { sha256: string }).sha256).toBe(expected);

    const files = (await inject('GET', `/api/v1/admin/packages/${pkgId}/files`, { token: adminToken })).json as { data: { filename: string; sha256: string }[] };
    expect(files.data).toHaveLength(1);
    expect(files.data[0]!.sha256).toBe(expected);
  });

  /**
   * Regression: the binary content-type parser buffered the whole body, putting
   * every upload under Fastify's 1 MB default bodyLimit. The route advertised a
   * 500 MB ceiling, but anything over 1 MB came back 413 — and a large file
   * would have been held entirely in memory anyway.
   */
  it('accepts a package file larger than the default body limit', async () => {
    const presign = (await inject('POST', `/api/v1/admin/packages/${pkgId}/files/presign`, {
      token: adminToken,
      body: { filename: 'big.pak', size: 2 * 1024 * 1024 },
    })).json as { uploadUrl: string };

    const path = presign.uploadUrl.replace(/^https?:\/\/[^/]+/, '');
    const payload = Buffer.alloc(2 * 1024 * 1024, 7); // 2 MB — over the 1 MB default
    const res = await app.inject({
      method: 'PUT',
      url: path,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(payload.length) },
      payload,
    });
    expect(res.statusCode, '2 MB package upload must not be rejected as too large').toBe(201);
  });

  it('publishes the package (semver bump) and gates downloads behind entitlements', async () => {
    const publish = await inject('POST', `/api/v1/admin/packages/${pkgId}/publish`, {
      token: adminToken,
      body: { changeNote: 'first release' },
    });
    expect(publish.status).toBe(200);
    expect((publish.json as { version: string; status: string }).version).toBe('1.0.1');
    expect((publish.json as { status: string }).status).toBe('published');

    const publicList = (await inject('GET', '/api/v1/games/dying-light/packages')).json as { data: { slug: string; version: string }[] };
    expect(publicList.data.some((p) => p.slug === 'rtx30-high-fps')).toBe(true);

    // Free user → 403.
    const denied = await inject('POST', '/api/v1/games/dying-light/packages/rtx30-high-fps/download', { token: freeToken });
    expect(denied.status).toBe(403);

    // Premium user → manifest with verified hashes + short-lived SIGNED URLs.
    const download = await inject('POST', '/api/v1/games/dying-light/packages/rtx30-high-fps/download', { token: premiumToken });
    expect(download.status).toBe(200);
    const body = download.json as {
      package: { name: string };
      files: { filename: string; sha256: string; url: string; destination: string; expiresIn: number }[];
    };
    expect(body.package.name).toBe('NVIDIA RTX 30 High FPS');
    expect(body.files[0]!.destination).toBe('Profiles/settings.cfg');
    expect(body.files[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);
    // Phase 12 — URLs must be signed (TTL-bounded), never the bare public object.
    expect(body.files[0]!.url).toContain('/api/v1/uploads/signed/');
    expect(body.files[0]!.expiresIn).toBeGreaterThan(0);
  });

  /**
   * Expiry is enforced purely by the entitlement query (status = active AND
   * expirationDate > now()) — there is no job that flips expired rows. That is
   * the right design, but it means a single dropped WHERE clause would silently
   * hand every lapsed user permanent premium, with nothing failing anywhere.
   */
  it('denies downloads once the subscription lapses, and restores them when it is renewed', async () => {
    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');

    const stillWorks = await inject('POST', '/api/v1/games/dying-light/packages/rtx30-high-fps/download', { token: premiumToken });
    expect(stillWorks.status, 'premium user starts with access').toBe(200);

    // Backdate the subscription AND its entitlements — the paid window is over.
    await db.execute(sql`UPDATE subscriptions SET expiration_date = now() - interval '1 day'
      WHERE user_id = (SELECT id FROM users WHERE email = 'user000002@example.test')`);
    await db.execute(sql`UPDATE entitlements SET expires_at = now() - interval '1 day'
      WHERE user_id = (SELECT id FROM users WHERE email = 'user000002@example.test')`);

    const lapsed = await inject('POST', '/api/v1/games/dying-light/packages/rtx30-high-fps/download', { token: premiumToken });
    expect(lapsed.status, 'lapsed subscription must lose premium').toBe(403);

    // Renewing restores it — no re-login, the token is still the same one.
    await db.execute(sql`UPDATE subscriptions SET expiration_date = now() + interval '30 days'
      WHERE user_id = (SELECT id FROM users WHERE email = 'user000002@example.test')`);
    await db.execute(sql`UPDATE entitlements SET expires_at = now() + interval '30 days'
      WHERE user_id = (SELECT id FROM users WHERE email = 'user000002@example.test')`);

    const renewed = await inject('POST', '/api/v1/games/dying-light/packages/rtx30-high-fps/download', { token: premiumToken });
    expect(renewed.status, 'renewal restores access without re-login').toBe(200);
  });

  it('revokes entitlements immediately on admin suspend and restores on re-activate (no premium window)', async () => {
    const list = (await inject('GET', '/api/v1/admin/subscriptions', { token: adminToken })).json as {
      data: { id: string; userEmail: string; status: string }[];
    };
    const sub = list.data.find((s) => s.userEmail === 'user000002@example.test')!;

    const suspend = await inject('PATCH', `/api/v1/admin/subscriptions/${sub.id}`, {
      token: adminToken,
      body: { status: 'suspended' },
    });
    expect(suspend.status).toBe(200);

    // The entitlement join requires subscription.status = 'active' — suspend
    // must cut downloads off immediately, server-side, with no window.
    const denied = await inject('POST', '/api/v1/games/dying-light/packages/rtx30-high-fps/download', { token: premiumToken });
    expect(denied.status).toBe(403);
    const me = (await inject('GET', '/api/v1/me/subscription', { token: premiumToken })).json as { isActive: boolean };
    expect(me.isActive).toBe(false);

    // Re-activating restores access for the remaining period (reversible).
    const reactivate = await inject('PATCH', `/api/v1/admin/subscriptions/${sub.id}`, {
      token: adminToken,
      body: { status: 'active' },
    });
    expect(reactivate.status).toBe(200);
    const allowed = await inject('POST', '/api/v1/games/dying-light/packages/rtx30-high-fps/download', { token: premiumToken });
    expect(allowed.status).toBe(200);
  });

  it('pushes entitlement expiry forward when an admin extends a subscription', async () => {
    const list = (await inject('GET', '/api/v1/admin/subscriptions', { token: adminToken })).json as {
      data: { id: string; userEmail: string; expirationDate: string }[];
    };
    const sub = list.data.find((s) => s.userEmail === 'user000002@example.test')!;

    const extend = await inject('PATCH', `/api/v1/admin/subscriptions/${sub.id}`, {
      token: adminToken,
      body: { extendDays: 45 },
    });
    expect(extend.status).toBe(200);
    const newExpiry = new Date((extend.json as { expirationDate: string }).expirationDate).getTime();

    // The entitlements rows must be pushed to the new expiry too, otherwise the
    // entitlement join (min of both dates) would cut the user off early.
    const { db } = await import('../db');
    const { entitlements } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');
    const ent = await db.query.entitlements.findFirst({ where: eq(entitlements.subscriptionId, sub.id) });
    expect(ent).not.toBeUndefined();
    expect(ent!.expiresAt.getTime()).toBe(newExpiry);

    const allowed = await inject('POST', '/api/v1/games/dying-light/packages/rtx30-high-fps/download', { token: premiumToken });
    expect(allowed.status).toBe(200);
  });

  it('serves signed downloads and rejects tampered/expired/raw links (Phase 12)', async () => {
    const download = await inject('POST', '/api/v1/games/dying-light/packages/rtx30-high-fps/download', { token: premiumToken });
    const body = download.json as { files: { filename: string; url: string; sha256: string }[] };
    const signedUrl = body.files[0]!.url;
    const apiBase = signedUrl.split('/api/v1')[0]!;
    const pathOnly = signedUrl.replace(apiBase, '');

    // Valid signed link serves the file bytes with a hash we already verified.
    const served = await app.inject({ method: 'GET', url: pathOnly });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-disposition']).toContain('attachment');

    // Tampered signature → rejected.
    const tampered = pathOnly.replace(/\/[a-f0-9]{64}\//, '/0000000000000000000000000000000000000000000000000000000000000000/');
    const bad = await app.inject({ method: 'GET', url: tampered });
    expect(bad.statusCode).toBe(403);

    // Expired link (timestamp in the past) → rejected.
    const m = /signed\/(\d+)\/([a-f0-9]{64})\/(.+)$/.exec(pathOnly);
    expect(m).not.toBeNull();
    const expiredPath = `/api/v1/uploads/signed/1/${m![2]}/${m![3]}`;
    const expired = await app.inject({ method: 'GET', url: expiredPath });
    expect(expired.statusCode).toBe(403);

    // Raw object path is never publicly served (local driver blocks it).
    const raw = await app.inject({ method: 'GET', url: `/uploads/${m![3]}` });
    expect(raw.statusCode).toBe(403);
  });

  it('exposes the release history (manifest snapshot per version)', async () => {
    const versions = await inject('GET', `/api/v1/admin/packages/${pkgId}/versions`, { token: adminToken });
    expect(versions.status).toBe(200);
    const rows = versions.json as { data: { version: string; changeNote: string | null; files: { sha256: string }[] }[] };
    expect(rows.data.length).toBeGreaterThanOrEqual(1);
    expect(rows.data[0]!.version).toBe('1.0.1');
    expect(rows.data[0]!.files[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('supersedes re-uploaded files — live manifest has one row per destination, version snapshots keep history', async () => {
    // v2 of the same file: re-upload `settings.cfg` with different content.
    const v2content = Buffer.from('dummy optimization config v2 (supersedes v1)\n');
    const presign = (await inject('POST', `/api/v1/admin/packages/${pkgId}/files/presign`, {
      token: adminToken,
      body: { filename: 'settings.cfg', size: v2content.length },
    })).json as { uploadUrl: string; objectKey: string };
    const key = presign.uploadUrl.split('/api/v1/uploads/packages/put/')[1]!;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/uploads/packages/put/${key}`,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(v2content.length) },
      payload: v2content,
    });
    const complete = await inject('POST', `/api/v1/admin/packages/${pkgId}/files/complete`, {
      token: adminToken,
      body: { storageKey: presign.objectKey, filename: 'settings.cfg', size: v2content.length, destination: 'Profiles/settings.cfg', operation: 'replace' },
    });
    expect(complete.status).toBe(200);
    const v2hash = (complete.json as { sha256: string }).sha256;

    const publish = await inject('POST', `/api/v1/admin/packages/${pkgId}/publish`, { token: adminToken, body: { changeNote: 'v2' } });
    expect(publish.status).toBe(200);

    // Live download manifest: exactly one row per destination, serving v2's hash.
    const download = await inject('POST', '/api/v1/games/dying-light/packages/rtx30-high-fps/download', { token: premiumToken });
    expect(download.status).toBe(200);
    const files = (download.json as { files: { destination: string; sha256: string }[] }).files;
    expect(files.filter((f) => f.destination === 'Profiles/settings.cfg')).toHaveLength(1);
    expect(files.find((f) => f.destination === 'Profiles/settings.cfg')!.sha256).toBe(v2hash);

    // Version history keeps both snapshots (v1 hash still auditable).
    const versions = (await inject('GET', `/api/v1/admin/packages/${pkgId}/versions`, { token: adminToken })).json as {
      data: { version: string; files: { sha256: string }[] }[];
    };
    expect(versions.data.length).toBeGreaterThanOrEqual(2);
    const v1Snapshot = versions.data[versions.data.length - 1]!;
    expect(v1Snapshot.files[0]!.sha256).not.toBe(v2hash);
  });

  it('recommends the best package for the detected hardware', async () => {
    // Add an AMD package too.
    const amd = await inject('POST', '/api/v1/admin/packages', {
      token: adminToken,
      body: { gameId, name: 'AMD Radeon Balanced', slug: 'amd-balanced', gpuVendor: 'amd', gpuFamily: 'radeon', targetFps: 60 },
    });
    const amdId = (amd.json as { id: string }).id;
    const amdContent = Buffer.from('amd settings v1\n');
    const presign = (await inject('POST', `/api/v1/admin/packages/${amdId}/files/presign`, {
      token: adminToken,
      body: { filename: 'amd.ini', size: amdContent.length },
    })).json as { uploadUrl: string; objectKey: string };
    const key = presign.uploadUrl.split('/api/v1/uploads/packages/put/')[1]!;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/uploads/packages/put/${key}`,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(amdContent.length) },
      payload: amdContent,
    });
    await inject('POST', `/api/v1/admin/packages/${amdId}/files/complete`, {
      token: adminToken,
      body: { storageKey: presign.objectKey, filename: 'amd.ini', size: amdContent.length, destination: 'amd.ini' },
    });
    await inject('POST', `/api/v1/admin/packages/${amdId}/publish`, { token: adminToken, body: {} });

    const nvidiaRec = await inject('POST', '/api/v1/hardware/recommend', {
      body: {
        gameSlug: 'dying-light',
        hardware: { gpuVendor: 'nvidia', gpuModel: 'NVIDIA GeForce RTX 3060', vramMb: 12288, ramGb: 16, windowsVersion: '10.0.22631', arch: 'x64' },
      },
    });
    expect(nvidiaRec.status).toBe(200);
    expect((nvidiaRec.json as { recommended: { slug: string } }).recommended?.slug).toBe('rtx30-high-fps');

    const amdRec = await inject('POST', '/api/v1/hardware/recommend', {
      body: {
        gameSlug: 'dying-light',
        hardware: { gpuVendor: 'amd', gpuModel: 'AMD Radeon RX 6700 XT', vramMb: 12288, ramGb: 16 },
      },
    });
    expect((amdRec.json as { recommended: { slug: string } }).recommended?.slug).toBe('amd-balanced');

    // Low-end NVIDIA below the NVIDIA package minimums → nothing compatible
    // (the AMD package excludes NVIDIA hardware by vendor).
    const lowEnd = await inject('POST', '/api/v1/hardware/recommend', {
      body: { gameSlug: 'dying-light', hardware: { gpuVendor: 'nvidia', gpuModel: 'GT 1030', vramMb: 2048, ramGb: 4 } },
    });
    const low = lowEnd.json as { recommended: { slug: string } | null; reasons: string[] };
    expect(low.recommended).toBeNull();
    expect(low.reasons.length).toBeGreaterThan(0);
  });
});

describe('multi-game isolation (universal catalog)', () => {
  // Game A = dying-light (already has packages from the suite above).
  // Game B = gta-v — this suite proves packages/manifests/hashes/history stay
  // strictly per-game and that cross-game lookups/downloads are rejected.
  let adminToken: string;
  let premiumToken: string;
  let pkgBId: string;
  const pkgBSlug = 'gta-v-ultra-fps';

  beforeAll(async () => {
    const adminLogin = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    adminToken = (adminLogin.json as { accessToken: string }).accessToken;

    const reg = await registerUser('user000099@example.test', 'IsoPass123!', 'isopremium');
    premiumToken = (reg.json as { accessToken: string }).accessToken;
    const plans = (await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { id: string }[] };
    const purchase = await inject('POST', '/api/v1/subscriptions/purchase', {
      token: premiumToken,
      body: { planId: plans.data[0]!.id, idempotencyKey: 'iso-suite-0001' },
    });
    const pid = (purchase.json as { paymentId: string }).paymentId;
    await inject('POST', '/api/v1/payments/mock/callback', { body: { paymentId: pid } });
  });

  it('creates + publishes a package for game B with its own manifest hash', async () => {
    const gta = (await inject('GET', '/api/v1/games?q=gta-v')).json as { data: { id: string }[] };
    const gameBId = gta.data[0]!.id;

    const create = await inject('POST', '/api/v1/admin/packages', {
      token: adminToken,
      body: { gameId: gameBId, name: 'GTA V Ultra FPS', slug: pkgBSlug, gpuVendor: 'nvidia', targetFps: 144 },
    });
    expect(create.status).toBe(201);
    pkgBId = (create.json as { id: string }).id;

    const content = Buffer.from('gta-v optimization settings v1\n');
    const presign = (await inject('POST', `/api/v1/admin/packages/${pkgBId}/files/presign`, {
      token: adminToken,
      body: { filename: 'settings.xml', size: content.length },
    })).json as { uploadUrl: string; objectKey: string };
    const key = presign.uploadUrl.split('/api/v1/uploads/packages/put/')[1]!;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/uploads/packages/put/${key}`,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(content.length) },
      payload: content,
    });
    const complete = await inject('POST', `/api/v1/admin/packages/${pkgBId}/files/complete`, {
      token: adminToken,
      body: { storageKey: presign.objectKey, filename: 'settings.xml', size: content.length, destination: 'Profiles/settings.xml', operation: 'replace' },
    });
    expect(complete.status).toBe(200);

    const publish = await inject('POST', `/api/v1/admin/packages/${pkgBId}/publish`, {
      token: adminToken,
      body: { changeNote: 'gta v first release' },
    });
    expect(publish.status).toBe(200);
  });

  it('keeps per-game package lists isolated', async () => {
    const gtaList = (await inject('GET', '/api/v1/games/gta-v/packages')).json as { data: { slug: string }[] };
    expect(gtaList.data.some((p) => p.slug === pkgBSlug)).toBe(true);
    expect(gtaList.data.some((p) => p.slug === 'rtx30-high-fps')).toBe(false);

    const dlList = (await inject('GET', '/api/v1/games/dying-light/packages')).json as { data: { slug: string }[] };
    expect(dlList.data.some((p) => p.slug === pkgBSlug)).toBe(false);
  });

  it('rejects cross-game package lookups and downloads (IDOR-safe)', async () => {
    // Game A's endpoint must never resolve game B's package.
    const lookup = await inject('GET', '/api/v1/games/dying-light/packages/gta-v-ultra-fps');
    expect(lookup.status).toBe(404);

    // Even a premium user cannot download game B's package through game A.
    const download = await inject('POST', '/api/v1/games/dying-light/packages/gta-v-ultra-fps/download', {
      token: premiumToken,
    });
    expect(download.status).toBe(404);
  });

  it('keeps per-game hashes and version snapshots distinct', async () => {
    const gtaPkg = (await inject('GET', '/api/v1/games/gta-v/packages/gta-v-ultra-fps')).json as {
      package: { version: string };
      manifest: { filename: string; sha256: string }[];
    };
    const dlPkg = (await inject('GET', '/api/v1/games/dying-light/packages/rtx30-high-fps')).json as {
      package: { version: string };
      manifest: { filename: string; sha256: string }[];
    };

    // Versions are independent per game (the dying-light suite re-published
    // to v2 later; gta-v stayed at v1) — the point is they are NOT shared.
    expect(gtaPkg.package.version).toBeTruthy();
    expect(dlPkg.package.version).toBeTruthy();
    expect(gtaPkg.manifest[0]!.sha256).not.toBe(dlPkg.manifest[0]!.sha256);
    expect(gtaPkg.manifest[0]!.filename).toBe('settings.xml');
    expect(dlPkg.manifest[0]!.filename).toBe('settings.cfg');
  });
});

describe('hardware, devices & settings (Phase 7 & 10)', () => {
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const adminLogin = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    adminToken = (adminLogin.json as { accessToken: string }).accessToken;

    const reg = await registerUser('user000004@example.test', 'HwPass123!', 'hwtest');
    userToken = (reg.json as { accessToken: string }).accessToken;
  });

  it('stores and returns the hardware profile', async () => {
    const put = await inject('PUT', '/api/v1/me/hardware', {
      token: userToken,
      body: {
        cpu: 'AMD Ryzen 5 5500U',
        gpuVendor: 'nvidia',
        gpuModel: 'NVIDIA GeForce RTX 3050 Laptop',
        vramMb: 4096,
        ramGb: 16,
        windowsVersion: 'Microsoft Windows 11 Pro 10.0.22631',
        arch: 'x64',
        resolution: '1920x1080',
        driverVersion: '31.0.15.4633',
      },
    });
    expect(put.status).toBe(200);
    expect((put.json as { gpuModel: string }).gpuModel).toContain('RTX 3050');

    const get = await inject('GET', '/api/v1/me/hardware', { token: userToken });
    expect(get.status).toBe(200);
    expect((get.json as { ramGb: number }).ramGb).toBe(16);
  });

  it('lists and revokes devices in the admin panel', async () => {
    const device = await inject('POST', '/api/v1/me/devices', {
      token: userToken,
      body: { deviceId: 'hw-device-00000000000000000001', name: 'HW Test PC' },
    });
    expect(device.status).toBe(201);
    const deviceId = (device.json as { id: string }).id;

    const list = (await inject('GET', '/api/v1/admin/devices', { token: adminToken })).json as {
      data: { id: string; userEmail: string | null }[];
    };
    expect(list.data.some((d) => d.id === deviceId && d.userEmail === 'user000004@example.test')).toBe(true);

    const revoke = await inject('POST', `/api/v1/admin/devices/${deviceId}/revoke`, { token: adminToken });
    expect(revoke.status).toBe(200);
  });

  it('publishes remote settings that the public /config reflects', async () => {
    const put = await inject('PUT', '/api/v1/admin/settings', {
      token: adminToken,
      body: { settings: { announcement: { enabled: true, text: 'Test announcement' } } },
    });
    expect(put.status).toBe(200);

    const cfg = (await inject('GET', '/api/v1/config')).json as { data: { announcement: { enabled: boolean; text: string } } };
    expect(cfg.data.announcement.enabled).toBe(true);
    expect(cfg.data.announcement.text).toBe('Test announcement');
  });

  it('exposes failed login attempts to the admin', async () => {
    await inject('POST', '/api/v1/auth/login', { body: { identifier: 'user000004@example.test', password: 'WrongPass!' } });
    const attempts = (await inject('GET', '/api/v1/admin/security/login-attempts', { token: adminToken })).json as {
      data: { email: string; success: boolean }[];
    };
    expect(attempts.data.some((a) => a.email === 'user000004@example.test' && !a.success)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 19 — Security Audit (OWASP-focused regression tests)
// ---------------------------------------------------------------------------
describe('security audit (Phase 19)', () => {
  let adminToken: string;
  let aliceToken: string;
  let bobToken: string;
  let aliceDeviceId: string;
  let planPrice: number;
  let planId: string;

  async function registerUser(email: string, username: string) {
    const otpRes = await inject('POST', '/api/v1/auth/otp/send', { body: { identifier: email, purpose: 'register' } });
    expect(otpRes.status).toBe(200);
    const otp = (otpRes.json as { devCode?: string }).devCode;
    const reg = await inject('POST', '/api/v1/auth/register', {
      body: { identifier: email, username, password: 'SecPass123!', otp },
    });
    expect(reg.status).toBe(201);
    return (reg.json as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    const adminLogin = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    adminToken = (adminLogin.json as { accessToken: string }).accessToken;
    aliceToken = await registerUser('user000005@example.test', 'alicesec');
    bobToken = await registerUser('user000006@example.test', 'bobsec');

    const plans = (await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { id: string; price: number }[] };
    planId = plans.data[0]!.id;
    planPrice = plans.data[0]!.price;

    const device = await inject('POST', '/api/v1/me/devices', {
      token: aliceToken,
      body: { deviceId: 'alice-sec-device-00000001', name: 'Alice PC' },
    });
    aliceDeviceId = (device.json as { id: string }).id;
  });

  it('blocks cross-user IDOR on device management', async () => {
    // Bob cannot revoke Alice's device (route is scoped to the caller).
    const revoke = await inject('DELETE', `/api/v1/me/devices/${aliceDeviceId}`, { token: bobToken });
    expect(revoke.status).toBe(404);

    // Bob cannot see Alice's devices.
    const bobDevices = (await inject('GET', '/api/v1/me/devices', { token: bobToken })).json as { data: { deviceId: string }[] };
    expect(bobDevices.data.some((d) => d.deviceId === 'alice-sec-device-00000001')).toBe(false);

    // Each /me returns only the caller's profile.
    const aliceMe = (await inject('GET', '/api/v1/me', { token: aliceToken })).json as { email: string };
    const bobMe = (await inject('GET', '/api/v1/me', { token: bobToken })).json as { email: string };
    expect(aliceMe.email).toBe('user000005@example.test');
    expect(bobMe.email).toBe('user000006@example.test');
  });

  /**
   * The upload endpoints are unauthenticated by design — the client PUTs raw
   * bytes to the URL presign handed it. That makes the HMAC the ONLY thing
   * standing between the internet and arbitrary writes into the upload dir:
   * without it anyone could invent a key (filling the disk on a self-hosted
   * box) or overwrite an existing image whose key is public in the API.
   */
  it('refuses uploads that were not presigned, for both image and package keys', async () => {
    const forged = [
      '/api/v1/uploads/put/9999999999/deadbeef/attacker-controlled.png',
      `/api/v1/uploads/put/9999999999/${'a'.repeat(64)}/games/anything.png`,
      '/api/v1/uploads/packages/put/9999999999/deadbeef/packages/evil/payload.zip',
    ];
    for (const url of forged) {
      const res = await app.inject({
        method: 'PUT', url,
        headers: { 'content-length': '10', 'content-type': 'application/octet-stream' },
        payload: 'xxxxxxxxxx',
      });
      expect([400, 403], `unsigned PUT must be refused: ${url}`).toContain(res.statusCode);
      expect(res.statusCode, `must not accept: ${url}`).not.toBe(201);
    }
  });

  it('refuses an upload URL whose signature has expired', async () => {
    const login = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    const t = (login.json as { accessToken: string }).accessToken;
    const presign = (await inject('POST', '/api/v1/admin/uploads/presign', {
      token: t,
      body: { kind: 'cover', contentType: 'image/png', size: 10 },
    })).json as { uploadUrl: string };

    const path = presign.uploadUrl.replace(/^https?:\/\/[^/]+/, '');
    const [, , , , exp, sig, ...rest] = path.split('/');
    // Same signature, but claim it was issued for a moment already past.
    const stale = `/api/v1/uploads/put/${Number(exp) - 10_000}/${sig}/${rest.join('/')}`;
    const res = await app.inject({
      method: 'PUT', url: stale,
      headers: { 'content-length': '10', 'content-type': 'application/octet-stream' },
      payload: 'xxxxxxxxxx',
    });
    expect(res.statusCode, 'expired upload URL must be refused').toBe(403);
  });

  it('rejects price manipulation — the server prices from the plan table, never the client', async () => {
    // Client smuggles a discounted amount in the body — it must be ignored.
    const purchase = await inject('POST', '/api/v1/subscriptions/purchase', {
      token: bobToken,
      body: { planId, idempotencyKey: 'sec-price-key-0001', amount: 1 },
    });
    expect(purchase.status).toBe(200);

    const payments = (await inject('GET', '/api/v1/admin/payments', { token: adminToken })).json as {
      data: { amount: number; userEmail: string }[];
    };
    const row = payments.data.find((p) => p.userEmail === 'user000006@example.test');
    expect(row).toBeTruthy();
    expect(row!.amount).toBe(planPrice);
    expect(row!.amount).not.toBe(1);

    // Fabricated plan id → 404, never a silent discount.
    const fake = await inject('POST', '/api/v1/subscriptions/purchase', {
      token: bobToken,
      body: { planId: '00000000-0000-4000-8000-000000000000', idempotencyKey: 'sec-price-key-0002' },
    });
    expect(fake.status).toBe(404);
  });

  it('requires the HttpOnly refresh cookie (CSRF posture)', async () => {
    // No cookie at all → 401. The refresh token is never a bearer secret in JS.
    const noCookie = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(noCookie.statusCode).toBe(401);

    // A random cookie value is not a valid session → 401.
    const forged = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: `goh_user_refresh=${'f'.repeat(96)}` },
    });
    expect(forged.statusCode).toBe(401);
  });

  it('returns 429 (never 500) when a route rate limit is exceeded', async () => {
    // /auth/password/forgot has a per-route limit of 10/min. The reset test
    // consumed one; hammer the rest and verify rejection is a clean 429.
    const results = [];
    for (let i = 0; i < 11; i++) {
      const res = await inject('POST', '/api/v1/auth/password/forgot', { body: { identifier: 'user000007@example.test' } });
      results.push(res.status);
    }
    expect(results.some((s) => s === 429)).toBe(true);
    expect(results.every((s) => s !== 500)).toBe(true);
  });

  it('does not leak admin data through the public API', async () => {
    const games = (await inject('GET', '/api/v1/games')).json as { data: unknown[] };
    // Public responses must be plain arrays of summaries, not raw DB rows.
    const first = games.data[0] as Record<string, unknown>;
    expect(first).not.toHaveProperty('adminNotes');
    expect(first).not.toHaveProperty('viewCount');

    const unauthorized = await inject('GET', '/api/v1/admin/users', {});
    expect(unauthorized.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Game catalog importer — directory-driven, deterministic, idempotent.
// ---------------------------------------------------------------------------
describe('game catalog importer (directory-driven)', () => {
  it('scans the real icon pack with unique deterministic slugs and zero missing icons', () => {
    const iconDir = path.resolve(__dirname, '../../../../icon/game icon');
    const fs = awaitImportFs();
    const mkdtemp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'goh-icons-'));
    // Symlink the real pack into a temp dir so the scan is fully isolated.
    fs.symlinkSync(iconDir, path.join(mkdtemp, 'pack'), 'dir');
    const { entries, missingIcons, duplicates } = scanIconDir(path.join(mkdtemp, 'pack'));
    expect(entries.length).toBeGreaterThan(200);
    expect(missingIcons.length).toBe(0);
    // The pack contains two folder-name collisions (Assassin's Creed Syndicate
    // and Dragon Age Inquisition each exist in two spellings); they are resolved
    // deterministically with `-2` suffixes, never silently dropped.
    expect(duplicates).toBe(2);
    const slugs = new Set(entries.map((e) => e.slug));
    expect(slugs.size).toBe(entries.length);
    // Determinism: scanning twice yields identical assignments.
    const again = scanIconDir(path.join(mkdtemp, 'pack'));
    expect(again.entries.map((e) => e.slug)).toEqual(entries.map((e) => e.slug));
    fs.rmSync(mkdtemp, { recursive: true, force: true });
  });

  it('slugifies folder names deterministically and resolves collisions', () => {
    expect(slugifyFolder('Grand Theft Auto V')).toBe('grand-theft-auto-v');
    expect(slugifyFolder('ELDEN RING — Shadow of the Erdtree!')).toBe('elden-ring-shadow-of-the-erdtree');
    expect(slugifyFolder('  Alan   Wake 2  ')).toBe('alan-wake-2');
    const { slugs, duplicates } = resolveSlugs(['Test Game', 'test game', 'Test Game!']);
    expect(slugs.get('Test Game')).toBe('test-game');
    expect(slugs.get('test game')).toBe('test-game-2');
    expect(slugs.get('Test Game!')).toBe('test-game-3');
    expect(duplicates).toBe(2);
  });

  it('imports idempotently into the database (3 runs → still 3 games, 0 duplicates)', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'goh-import-'));
    const out = path.join(tmp, 'icons-out');
    // Three fake icon folders, each with a tiny valid PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    for (const folder of ['Alpha Test', 'Beta Test', 'Gamma Test']) {
      const dir = path.join(tmp, 'icons', folder);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'favicon.png'), png);
    }
    const { importCatalog } = await import('../scripts/import-catalog');
    const run = () =>
      importCatalog({ iconDir: path.join(tmp, 'icons'), outputDir: out, convertIcons: false });

    const first = await run();
    expect(first.foldersFound).toBe(3);
    expect(first.gamesImported).toBe(3);
    expect(first.databaseErrors).toEqual([]);

    const second = await run();
    expect(second.gamesImported).toBe(0);
    expect(second.gamesAlreadyPresent).toBe(3);
    expect(second.foldersFound).toBe(3);

    const third = await run();
    expect(third.gamesImported).toBe(0);
    expect(third.gamesAlreadyPresent).toBe(3);

    const { db } = await import('../db');
    const { games } = await import('../db/schema');
    const { inArray } = await import('drizzle-orm');
    const rows = await db.select().from(games).where(inArray(games.slug, ['alpha-test', 'beta-test', 'gamma-test']));
    expect(rows.length).toBe(3);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(3);

    // Cleanup so later suites aren't affected.
    await db.delete(games).where(inArray(games.slug, ['alpha-test', 'beta-test', 'gamma-test']));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

/**
 * Multi-Frame Generation tools — OptiFlow and OptiScaler.
 *
 * These are global packages (no game), reached by kind rather than by slug.
 * The properties that matter: an unpublished tool reads as "not available"
 * without a subscription, the bytes are gated behind one, and a file whose
 * destination is resolved on the client cannot smuggle a path through the
 * manifest.
 */
describe('multi-frame generation tools (OptiFlow / OptiScaler)', () => {
  let adminToken: string;
  let premiumToken: string;
  let freeToken: string;
  let pkgId: string;

  async function uploadFile(
    id: string,
    filename: string,
    body: Record<string, unknown>,
    content = Buffer.from(`bytes for ${filename}`),
  ) {
    const presign = (
      await inject('POST', `/api/v1/admin/packages/${id}/files/presign`, {
        token: adminToken,
        body: { filename, size: content.length },
      })
    ).json as { uploadUrl: string; objectKey: string };
    const key = presign.uploadUrl.split('/api/v1/uploads/packages/put/')[1]!;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/uploads/packages/put/${key}`,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(content.length) },
      payload: content,
    });
    return inject('POST', `/api/v1/admin/packages/${id}/files/complete`, {
      token: adminToken,
      body: { storageKey: presign.objectKey, filename, size: content.length, ...body },
    });
  }

  beforeAll(async () => {
    const adminLogin = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    adminToken = (adminLogin.json as { accessToken: string }).accessToken;

    const reg = await registerUser('user000042@example.test', 'MfgPass123!', 'mfgpremium');
    premiumToken = (reg.json as { accessToken: string }).accessToken;
    const plans = (await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { id: string }[] };
    const purchase = await inject('POST', '/api/v1/subscriptions/purchase', {
      token: premiumToken,
      body: { planId: plans.data[0]!.id, idempotencyKey: 'mfg-suite-0001' },
    });
    await inject('POST', '/api/v1/payments/mock/callback', {
      body: { paymentId: (purchase.json as { paymentId: string }).paymentId },
    });

    const freeReg = await registerUser('user000043@example.test', 'MfgPass123!', 'mfgfree');
    freeToken = (freeReg.json as { accessToken: string }).accessToken;
  });

  it('reports a tool as unavailable before anything is published — without asking for a subscription', async () => {
    // An empty admin panel must not look like a paywall, so this route is
    // public. A 401 here would tell the user to buy something that does not exist.
    const res = await inject('GET', '/api/v1/mfg/tools/optiflow');
    expect(res.status).toBe(200);
    expect((res.json as { available: boolean }).available).toBe(false);
    expect((res.json as { package: unknown }).package).toBeNull();
  });

  it('rejects a tool name that is not one of the two', async () => {
    expect((await inject('GET', '/api/v1/mfg/tools/optiplease')).status).toBe(400);
  });

  it('creates a global package with no game attached', async () => {
    const create = await inject('POST', '/api/v1/admin/packages', {
      token: adminToken,
      body: { name: 'OptiFlow', slug: 'optiflow-core', kind: 'optiflow' },
    });
    expect(create.status).toBe(201);
    expect((create.json as { gameId: string | null }).gameId).toBeNull();
    pkgId = (create.json as { id: string }).id;
  });

  it('lists the global package in the admin panel', async () => {
    // Regression: the list inner-joined `games`, so a package with no game
    // vanished from the table while the count above it still said 1 — an
    // uploaded OptiFlow payload was unreachable in the UI.
    const list = (await inject('GET', '/api/v1/admin/packages?limit=100', { token: adminToken })).json as {
      data: { id: string; gameId: string | null; gameName: string | null }[];
      meta: { total: number };
    };
    const mine = list.data.find((p) => p.id === pkgId);
    expect(mine, 'global package missing from the admin list').toBeDefined();
    expect(mine!.gameId).toBeNull();
    expect(list.data.length).toBe(Math.min(list.meta.total, 100));
  });

  it('refuses a second global package with the same slug', async () => {
    // Postgres treats NULLs as distinct, so the (game_id, slug) unique index
    // does not cover this on its own.
    const dupe = await inject('POST', '/api/v1/admin/packages', {
      token: adminToken,
      body: { name: 'OptiFlow again', slug: 'optiflow-core', kind: 'optiflow' },
    });
    expect(dupe.status).toBe(400);
  });

  it('refuses a path for a role whose folder the installer decides', async () => {
    // Accepting this would publish a package whose path half is silently
    // ignored on every machine that installs it.
    for (const role of ['streamline', 'launcher']) {
      const res = await uploadFile(pkgId, 'sl.dlss_g.dll', { destination: `bin/x64/sl.dlss_g.dll`, role, operation: 'replace' });
      expect(res.status, role).toBe(400);
    }
  });

  it('still refuses an executable destination whatever the role', async () => {
    const res = await uploadFile(pkgId, 'version.dll', { destination: 'payload.exe', role: 'launcher', operation: 'add' });
    expect(res.status).toBe(400);
  });

  it('accepts a streamline component and a launcher unlocker, and keeps their roles', async () => {
    expect((await uploadFile(pkgId, 'sl.dlss_g.dll', { destination: 'sl.dlss_g.dll', role: 'streamline', operation: 'replace' })).status).toBe(200);
    expect((await uploadFile(pkgId, 'version.dll', { destination: 'version.dll', role: 'launcher', operation: 'add' })).status).toBe(200);

    const files = (await inject('GET', `/api/v1/admin/packages/${pkgId}/files`, { token: adminToken })).json as {
      data: { filename: string; role: string }[];
    };
    const byName = Object.fromEntries(files.data.map((f) => [f.filename, f.role]));
    expect(byName['sl.dlss_g.dll']).toBe('streamline');
    expect(byName['version.dll']).toBe('launcher');
  });

  it('publishes, and the public status route now reports the manifest with roles', async () => {
    const publish = await inject('POST', `/api/v1/admin/packages/${pkgId}/publish`, { token: adminToken, body: {} });
    expect(publish.status).toBe(200);

    const res = await inject('GET', '/api/v1/mfg/tools/optiflow');
    const body = res.json as { available: boolean; manifest: { destination: string; role: string }[]; package: { version: string } };
    expect(body.available).toBe(true);
    expect(body.manifest).toHaveLength(2);
    expect(body.manifest.map((f) => f.role).sort()).toEqual(['launcher', 'streamline']);
    // The status route never leaks download URLs.
    expect(JSON.stringify(body)).not.toContain('uploads/packages');
  });

  it('gates the bytes behind a subscription', async () => {
    expect((await inject('POST', '/api/v1/mfg/tools/optiflow/download')).status).toBe(401);
    expect((await inject('POST', '/api/v1/mfg/tools/optiflow/download', { token: freeToken })).status).toBe(403);

    const ok = await inject('POST', '/api/v1/mfg/tools/optiflow/download', { token: premiumToken });
    expect(ok.status).toBe(200);
    const body = ok.json as { tool: string; files: { filename: string; role: string; url: string; sha256: string }[] };
    expect(body.tool).toBe('optiflow');
    expect(body.files).toHaveLength(2);
    for (const f of body.files) {
      expect(f.url, f.filename).toMatch(/^https?:\/\//);
      expect(f.sha256, f.filename).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('the published manifest hash matches the bytes actually stored', async () => {
    // The whole install pipeline trusts this hash: the client refuses a
    // download that does not match it, so a wrong hash here bricks the feature
    // rather than merely weakening it.
    const dl = (await inject('POST', '/api/v1/mfg/tools/optiflow/download', { token: premiumToken })).json as {
      files: { filename: string; sha256: string; url: string }[];
    };
    const { createHash } = await import('node:crypto');
    for (const f of dl.files) {
      const res = await app.inject({ method: 'GET', url: new URL(f.url).pathname + new URL(f.url).search });
      expect(res.statusCode, f.filename).toBe(200);
      expect(createHash('sha256').update(res.rawPayload).digest('hex'), f.filename).toBe(f.sha256);
    }
  });

  it('a tool with nothing published still 404s the download rather than returning an empty install', async () => {
    expect((await inject('POST', '/api/v1/mfg/tools/optiscaler/download', { token: premiumToken })).status).toBe(404);
  });

  /**
   * OptiScaler's per-vendor "order" profiles. One package, one base drop-in,
   * six mutually-exclusive OptiScaler.ini files that all land at the same
   * destination — so this is where a destination-keyed manifest would collapse
   * six profiles into one.
   */
  describe('profile selection', () => {
    const PROFILES = ['NVIDIA P1-6X', 'NVIDIA P2-6X', 'AMD P1-6X', 'AMD P2-6X', 'XESS P1-2X', 'XESS P2-2X'];
    let scalerId: string;

    it('accepts a base file plus six profiles that share a destination', async () => {
      const create = await inject('POST', '/api/v1/admin/packages', {
        token: adminToken,
        body: { name: 'OptiScaler', slug: 'optiscaler-core', kind: 'optiscaler' },
      });
      expect(create.status).toBe(201);
      scalerId = (create.json as { id: string }).id;

      expect((await uploadFile(scalerId, 'OptiScaler.dll', { destination: 'OptiScaler.dll', role: 'launcher', operation: 'add' })).status).toBe(200);
      for (const variant of PROFILES) {
        const res = await uploadFile(
          scalerId,
          'OptiScaler.ini',
          { destination: 'OptiScaler.ini', role: 'launcher', operation: 'replace', variant },
          Buffer.from(`; profile ${variant}\nDx12Upscaler=${variant.split(' ')[0]!.toLowerCase()}\n`),
        );
        expect(res.status, variant).toBe(200);
      }

      const files = (await inject('GET', `/api/v1/admin/packages/${scalerId}/files`, { token: adminToken })).json as {
        data: { destination: string; variant: string | null }[];
      };
      // Seven rows: one base + six profiles. Six of them share a destination.
      expect(files.data).toHaveLength(7);
      expect(files.data.filter((f) => f.destination === 'OptiScaler.ini')).toHaveLength(6);
    });

    it('publishes and offers every profile, in upload order', async () => {
      expect((await inject('POST', `/api/v1/admin/packages/${scalerId}/publish`, { token: adminToken, body: {} })).status).toBe(200);

      const status = (await inject('GET', '/api/v1/mfg/tools/optiscaler')).json as {
        available: boolean;
        variants: string[];
        manifest: { destination: string; variant: string | null }[];
      };
      expect(status.available).toBe(true);
      expect(status.variants).toEqual(PROFILES);
      expect(status.manifest).toHaveLength(7);
    });

    it('refuses a download that does not name a profile', async () => {
      // Resolving to the base alone would install OptiScaler with no config and
      // report success — the user would get none of what they chose.
      const res = await inject('POST', '/api/v1/mfg/tools/optiscaler/download', { token: premiumToken });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.json)).toContain('NVIDIA P1-6X');
    });

    it('refuses a profile that does not exist', async () => {
      const res = await inject('POST', '/api/v1/mfg/tools/optiscaler/download?variant=NVIDIA%20P9-99X', { token: premiumToken });
      expect(res.status).toBe(400);
    });

    it('returns the base plus exactly the chosen profile, never another', async () => {
      for (const variant of PROFILES) {
        const res = await inject('POST', `/api/v1/mfg/tools/optiscaler/download?variant=${encodeURIComponent(variant)}`, {
          token: premiumToken,
        });
        expect(res.status, variant).toBe(200);
        const { files } = res.json as { files: { destination: string; variant: string | null; url: string }[] };

        // Array.sort() stringifies, so a null sorts as "null" — compare as a set.
        expect(new Set(files.map((f) => f.variant)), variant).toEqual(new Set([null, variant]));
        expect(files, variant).toHaveLength(2);
        // A duplicate destination is what the native installer rejects outright.
        expect(new Set(files.map((f) => f.destination)).size, variant).toBe(files.length);

        // And the bytes really are that profile's, not another's.
        const ini = files.find((f) => f.destination === 'OptiScaler.ini')!;
        const url = new URL(ini.url);
        const body = await app.inject({ method: 'GET', url: url.pathname + url.search });
        expect(body.body, variant).toContain(`; profile ${variant}`);
      }
    });

    it('still gates the profiles behind a subscription', async () => {
      expect((await inject('POST', '/api/v1/mfg/tools/optiscaler/download?variant=AMD%20P1-6X')).status).toBe(401);
      expect((await inject('POST', '/api/v1/mfg/tools/optiscaler/download?variant=AMD%20P1-6X', { token: freeToken })).status).toBe(403);
    });
  });
});

/**
 * Defects found by the debug sweep, each reproduced before it was fixed.
 */
describe('audit regressions', () => {
  let adminToken: string;

  beforeAll(async () => {
    const login = await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    });
    adminToken = (login.json as { accessToken: string }).accessToken;
  });

  it('GET /settings returns its payload instead of a 500', async () => {
    // The query selected max(greatest(games, optimization_profiles, categories))
    // with only `games` in FROM, so Postgres refused it and every call 500'd.
    const res = await inject('GET', '/api/v1/settings');
    expect(res.status).toBe(200);
    const body = res.json as { appName: string; apiVersion: string; contentUpdatedAt: string | null };
    expect(body.appName).toBe('PC MAX');
    expect(body.apiVersion).toBe('v1');
    expect(body.contentUpdatedAt === null || typeof body.contentUpdatedAt === 'string').toBe(true);
  });

  it('a rejected genre edit leaves the existing genres intact', async () => {
    // linkCategories deleted every link before validating the slugs, so one typo
    // threw 404 *after* the delete committed and the game silently lost its genres.
    const created = await inject('POST', '/api/v1/admin/games', {
      token: adminToken,
      body: { name: 'Genre Rollback Probe', slug: 'genre-rollback-probe', status: 'published', genreSlugs: ['action'] },
    });
    expect(created.status).toBe(201);
    const gameId = (created.json as { id: string }).id;

    const before = (await inject('GET', `/api/v1/admin/games/${gameId}`, { token: adminToken })).json as {
      genres?: { slug: string }[];
    };
    const beforeCount = (before.genres ?? []).length;
    expect(beforeCount).toBeGreaterThan(0);

    const bad = await inject('PATCH', `/api/v1/admin/games/${gameId}`, {
      token: adminToken,
      body: { genreSlugs: ['action', 'definitely-not-a-real-genre'] },
    });
    expect(bad.status).toBe(404);

    const after = (await inject('GET', `/api/v1/admin/games/${gameId}`, { token: adminToken })).json as {
      genres?: { slug: string }[];
    };
    expect((after.genres ?? []).length, 'genres were wiped by a rejected edit').toBe(beforeCount);

    await inject('DELETE', `/api/v1/admin/games/${gameId}`, { token: adminToken });
  });

  it('genre counts exclude games that are not published', async () => {
    // The count was on the join-table column, so the published/not-deleted
    // filter on the games join did nothing.
    const created = await inject('POST', '/api/v1/admin/games', {
      token: adminToken,
      body: { name: 'Count Probe', slug: 'count-probe', status: 'draft', genreSlugs: ['action'] },
    });
    expect(created.status).toBe(201);
    const gameId = (created.json as { id: string }).id;

    const cats = (await inject('GET', '/api/v1/categories')).json as { data: { slug: string; gameCount: number }[] };
    const action = cats.data.find((c) => c.slug === 'action');
    const listed = (await inject('GET', '/api/v1/games?genre=action&limit=1')).json as { meta: { total: number } };
    expect(action?.gameCount, 'category count disagrees with the filtered list').toBe(listed.meta.total);

    await inject('DELETE', `/api/v1/admin/games/${gameId}`, { token: adminToken });
  });

  it('a category whose only games were deleted can still be deleted', async () => {
    // Soft-deleting a game leaves its category links, so the guard counted
    // games that no longer exist and the category became undeletable forever.
    const cat = await inject('POST', '/api/v1/admin/categories', {
      token: adminToken,
      body: { slug: 'probe-genre', name: 'Probe Genre' },
    });
    expect(cat.status).toBe(201);
    const catId = (cat.json as { id: string }).id;

    const game = await inject('POST', '/api/v1/admin/games', {
      token: adminToken,
      body: { name: 'Probe Genre Game', slug: 'probe-genre-game', status: 'published', genreSlugs: ['probe-genre'] },
    });
    expect(game.status).toBe(201);
    const gameId = (game.json as { id: string }).id;

    expect((await inject('DELETE', `/api/v1/admin/categories/${catId}`, { token: adminToken })).status).toBe(409);
    expect((await inject('DELETE', `/api/v1/admin/games/${gameId}`, { token: adminToken })).status).toBe(200);
    expect(
      (await inject('DELETE', `/api/v1/admin/categories/${catId}`, { token: adminToken })).status,
      'category still blocked by links to a deleted game',
    ).toBe(200);
  });

  it('published profiles come back in a deterministic order', async () => {
    // orderBy(isDefault) ascending sorted the default LAST, and with no default
    // flagged the key was constant, so the order was planner-dependent.
    const first = (await inject('GET', '/api/v1/games/dying-light/optimizations')).json as { data: { id: string }[] };
    const second = (await inject('GET', '/api/v1/games/dying-light/optimizations')).json as { data: { id: string }[] };
    expect(first.data.map((p) => p.id)).toEqual(second.data.map((p) => p.id));
  });
});

/**
 * OptiScaler: one package carrying three classes of content — the installer
 * drop-in, the selectable Plans, and the selectable Orders — combined into one
 * install.
 */
describe('optiscaler installer / plans / orders', () => {
  let adminToken: string;
  let premiumToken: string;
  let pkgId: string;

  async function up(id: string, filename: string, body: Record<string, unknown>, content = Buffer.from(`bytes:${filename}:${JSON.stringify(body)}`)) {
    const pre = (
      await inject('POST', `/api/v1/admin/packages/${id}/files/presign`, {
        token: adminToken,
        body: { filename, size: content.length },
      })
    ).json as { uploadUrl: string; objectKey: string };
    const key = pre.uploadUrl.split('/api/v1/uploads/packages/put/')[1]!;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/uploads/packages/put/${key}`,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(content.length) },
      payload: content,
    });
    return inject('POST', `/api/v1/admin/packages/${id}/files/complete`, {
      token: adminToken,
      body: { storageKey: pre.objectKey, filename, size: content.length, ...body },
    });
  }

  beforeAll(async () => {
    adminToken = ((await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    })).json as { accessToken: string }).accessToken;

    const reg = await registerUser('user000077@example.test', 'OsPass123!', 'ospremium');
    premiumToken = (reg.json as { accessToken: string }).accessToken;
    const plans = (await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { id: string }[] };
    const purchase = await inject('POST', '/api/v1/subscriptions/purchase', {
      token: premiumToken,
      body: { planId: plans.data[0]!.id, idempotencyKey: 'os-suite-1' },
    });
    await inject('POST', '/api/v1/payments/mock/callback', {
      body: { paymentId: (purchase.json as { paymentId: string }).paymentId },
    });

    const create = await inject('POST', '/api/v1/admin/packages', {
      token: adminToken,
      body: { name: 'OptiScaler Suite', slug: 'optiscaler-suite', kind: 'optiscaler' },
    });
    pkgId = (create.json as { id: string }).id;

    // base drop-in + 1 installer build + 8 plans + 12 orders
    await up(pkgId, 'libxess.dll', { destination: 'OptiScaler/libxess.dll', role: 'relative', operation: 'replace', component: 'installer' });
    await up(pkgId, 'OptiScaler.dll', { destination: 'OptiScaler.dll', role: 'launcher', operation: 'replace', component: 'installer', variant: 'Build A' });
    for (let i = 1; i <= 8; i += 1) {
      await up(pkgId, 'plan.ini', { destination: 'plan.ini', role: 'launcher', operation: 'replace', component: 'plan', variant: `Plan ${i}` });
    }
    for (let i = 1; i <= 12; i += 1) {
      await up(pkgId, 'OptiScaler.ini', { destination: 'OptiScaler.ini', role: 'launcher', operation: 'replace', component: 'order', variant: `Order ${i}` });
    }
    await inject('POST', `/api/v1/admin/packages/${pkgId}/publish`, { token: adminToken, body: {} });
  });

  it('keeps all 8 plans and all 12 orders despite shared destinations', async () => {
    // Every Plan ships plan.ini and every Order ships OptiScaler.ini. Deduping
    // on destination alone would collapse each group to a single entry.
    const s = (await inject('GET', '/api/v1/mfg/tools/optiscaler')).json as {
      available: boolean;
      installers: { name: string }[];
      plans: { name: string }[];
      orders: { name: string }[];
      baseFileCount: number;
    };
    expect(s.available).toBe(true);
    expect(s.installers.map((c) => c.name)).toEqual(['Build A']);
    expect(s.plans).toHaveLength(8);
    expect(s.orders).toHaveLength(12);
    expect(s.baseFileCount).toBe(1);
  });

  it('refuses a download that leaves a group unchosen', async () => {
    // Installing the drop-in with no Plan would look like success and deliver
    // none of the configuration the user picked.
    const res = await inject('POST', '/api/v1/mfg/tools/optiscaler/download?installer=Build%20A', { token: premiumToken });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toMatch(/plan/i);
  });

  it('refuses a plan or order that was never published', async () => {
    expect(
      (await inject('POST', '/api/v1/mfg/tools/optiscaler/download?installer=Build%20A&plan=Plan%2099&order=Order%201', { token: premiumToken })).status,
    ).toBe(400);
    expect(
      (await inject('POST', '/api/v1/mfg/tools/optiscaler/download?installer=Build%20A&plan=Plan%201&order=Nope', { token: premiumToken })).status,
    ).toBe(400);
  });

  it('returns base + exactly the chosen installer, plan and order', async () => {
    const res = await inject(
      'POST',
      '/api/v1/mfg/tools/optiscaler/download?installer=Build%20A&plan=Plan%203&order=Order%207',
      { token: premiumToken },
    );
    expect(res.status).toBe(200);
    const { files } = res.json as { files: { component: string; variant: string | null; destination: string; url: string }[] };

    expect(files).toHaveLength(4); // base + installer + plan + order
    expect(new Set(files.map((f) => f.variant))).toEqual(new Set([null, 'Build A', 'Plan 3', 'Order 7']));
    // No two files may target the same path — the native installer refuses that.
    expect(new Set(files.map((f) => f.destination)).size).toBe(files.length);
    // And the bytes really are the chosen ones, not another plan's.
    const plan = files.find((f) => f.component === 'plan')!;
    const url = new URL(plan.url);
    const body = await app.inject({ method: 'GET', url: url.pathname + url.search });
    expect(body.body).toContain('Plan 3');
  });

  it('never leaks another plan or order into the install', async () => {
    for (const [p, o] of [['Plan 1', 'Order 1'], ['Plan 8', 'Order 12']] as const) {
      const res = await inject(
        'POST',
        `/api/v1/mfg/tools/optiscaler/download?installer=Build%20A&plan=${encodeURIComponent(p)}&order=${encodeURIComponent(o)}`,
        { token: premiumToken },
      );
      const { files } = res.json as { files: { variant: string | null }[] };
      const others = files.filter((f) => f.variant !== null && f.variant !== 'Build A' && f.variant !== p && f.variant !== o);
      expect(others, `${p}/${o} leaked ${others.map((f) => f.variant).join()}`).toEqual([]);
    }
  });

  it('still gates the bytes behind a subscription', async () => {
    expect((await inject('POST', '/api/v1/mfg/tools/optiscaler/download?installer=Build%20A&plan=Plan%201&order=Order%201')).status).toBe(401);
  });

  it('names a packaging conflict instead of failing during the install', async () => {
    // A shared file and a chosen Plan both claiming one path would reach the
    // native installer as "two files both want to write X" — accurate, but
    // discovered after the download and impossible for a user to act on.
    const clash = await inject('POST', '/api/v1/admin/packages', {
      token: adminToken,
      body: { name: 'OptiScaler Clash', slug: 'optiscaler-clash', kind: 'streamline' },
    });
    const id = (clash.json as { id: string }).id;
    await up(id, 'conf.ini', { destination: 'conf.ini', role: 'launcher', operation: 'replace', component: 'installer' });
    await up(id, 'conf.ini', { destination: 'conf.ini', role: 'launcher', operation: 'replace', component: 'plan', variant: 'P1' });
    await inject('POST', `/api/v1/admin/packages/${id}/publish`, { token: adminToken, body: {} });

    const res = await inject('POST', '/api/v1/mfg/tools/streamline/download?plan=P1', { token: premiumToken });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain('conf.ini');
  });
});

/**
 * AI Optical Flow: one package, two selectable axes — which Unlocker build and
 * which Streamline package — resolved through the same component machinery as
 * OptiScaler rather than a second code path.
 */
describe('ai optical flow unlocker / streamline', () => {
  let adminToken: string;
  let premiumToken: string;
  let pkgId: string;

  async function up(id: string, filename: string, body: Record<string, unknown>, content = Buffer.from(`b:${filename}:${JSON.stringify(body)}`)) {
    const pre = (
      await inject('POST', `/api/v1/admin/packages/${id}/files/presign`, { token: adminToken, body: { filename, size: content.length } })
    ).json as { uploadUrl: string; objectKey: string };
    const key = pre.uploadUrl.split('/api/v1/uploads/packages/put/')[1]!;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/uploads/packages/put/${key}`,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(content.length) },
      payload: content,
    });
    return inject('POST', `/api/v1/admin/packages/${id}/files/complete`, {
      token: adminToken,
      body: { storageKey: pre.objectKey, filename, size: content.length, ...body },
    });
  }

  beforeAll(async () => {
    adminToken = ((await inject('POST', '/api/v1/admin/auth/login', {
      body: { email: 'admin@test.local', password: 'TestPass123!' },
    })).json as { accessToken: string }).accessToken;

    const reg = await registerUser('user000088@example.test', 'AofPass123!', 'aofpremium');
    premiumToken = (reg.json as { accessToken: string }).accessToken;
    const plans = (await inject('GET', '/api/v1/subscriptions/plans')).json as { data: { id: string }[] };
    const purchase = await inject('POST', '/api/v1/subscriptions/purchase', {
      token: premiumToken,
      body: { planId: plans.data[0]!.id, idempotencyKey: 'aof-suite-0001' },
    });
    await inject('POST', '/api/v1/payments/mock/callback', {
      body: { paymentId: (purchase.json as { paymentId: string }).paymentId },
    });
    pkgId = ((await inject('POST', '/api/v1/admin/packages', {
      token: adminToken,
      body: { name: 'AI Optical Flow', slug: 'aof-suite', kind: 'optiflow' },
    })).json as { id: string }).id;

    // 3 unlocker builds, each a launcher-side version.dll
    for (const v of ['Unlocker 7', 'Unlocker 8', 'Unlocker 13']) {
      await up(pkgId, 'version.dll', { destination: 'version.dll', role: 'launcher', operation: 'replace', component: 'unlocker', variant: v });
    }
    // 4 streamline packages, each replacing the same two components in place
    for (const v of ['Streamline PC Max V1', 'Streamline PC Max V2', 'Streamline 2-11', 'Streamline 2-12']) {
      await up(pkgId, 'sl.interposer.dll', { destination: 'sl.interposer.dll', role: 'streamline', operation: 'replace', component: 'streamline', variant: v });
      await up(pkgId, 'sl.dlss_g.dll', { destination: 'sl.dlss_g.dll', role: 'streamline', operation: 'replace', component: 'streamline', variant: v });
    }
    await inject('POST', `/api/v1/admin/packages/${pkgId}/publish`, { token: adminToken, body: {} });
  });

  it('keeps all 3 unlockers and all 4 streamline packages despite shared filenames', async () => {
    // Every unlocker ships version.dll and every streamline package ships the
    // same two component names; dropping the component axis from the manifest
    // dedupe would collapse each group to one entry.
    const s = (await inject('GET', '/api/v1/mfg/tools/optiflow')).json as {
      available: boolean;
      unlockers: { name: string; fileCount: number }[];
      streamlines: { name: string; fileCount: number }[];
    };
    expect(s.available).toBe(true);
    expect(s.unlockers.map((c) => c.name)).toEqual(['Unlocker 7', 'Unlocker 8', 'Unlocker 13']);
    expect(s.streamlines.map((c) => c.name)).toEqual([
      'Streamline PC Max V1',
      'Streamline PC Max V2',
      'Streamline 2-11',
      'Streamline 2-12',
    ]);
    expect(s.streamlines.every((c) => c.fileCount === 2)).toBe(true);
  });

  it('refuses an install that leaves either axis unchosen', async () => {
    for (const q of ['unlocker=Unlocker%207', 'streamline=Streamline%202-11']) {
      const res = await inject('POST', `/api/v1/mfg/tools/optiflow/download?${q}`, { token: premiumToken });
      expect(res.status, q).toBe(400);
    }
  });

  it('installs exactly the versions chosen, never a different one', async () => {
    // The requirement the spec is most explicit about: pick 2-11 and you get
    // 2-11, not whichever package happened to be uploaded last.
    for (const [u, sl] of [
      ['Unlocker 7', 'Streamline PC Max V1'],
      ['Unlocker 13', 'Streamline 2-12'],
      ['Unlocker 8', 'Streamline 2-11'],
    ] as const) {
      const res = await inject(
        'POST',
        `/api/v1/mfg/tools/optiflow/download?unlocker=${encodeURIComponent(u)}&streamline=${encodeURIComponent(sl)}`,
        { token: premiumToken },
      );
      expect(res.status, `${u}/${sl}`).toBe(200);
      const { files } = res.json as { files: { component: string; variant: string | null; destination: string; url: string }[] };

      expect(new Set(files.map((f) => f.variant)), `${u}/${sl}`).toEqual(new Set([u, sl]));
      expect(files.filter((f) => f.component === 'unlocker')).toHaveLength(1);
      expect(files.filter((f) => f.component === 'streamline')).toHaveLength(2);
      expect(new Set(files.map((f) => f.destination)).size).toBe(files.length);

      // And the bytes are that build's, not another's.
      const unlockerFile = files.find((f) => f.component === 'unlocker')!;
      const url = new URL(unlockerFile.url);
      const body = await app.inject({ method: 'GET', url: url.pathname + url.search });
      expect(body.body, `${u} bytes`).toContain(u);
    }
  });

  it('rejects an unknown version by name and lists the real ones', async () => {
    const res = await inject('POST', '/api/v1/mfg/tools/optiflow/download?unlocker=Unlocker%2099&streamline=Streamline%202-11', {
      token: premiumToken,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain('Unlocker 7');
  });

  it('still gates the bytes behind a subscription', async () => {
    expect(
      (await inject('POST', '/api/v1/mfg/tools/optiflow/download?unlocker=Unlocker%207&streamline=Streamline%202-11')).status,
    ).toBe(401);
  });

  it('keeps two groups apart when they share a version name and a filename', async () => {
    // Nothing stops an administrator naming an Unlocker and a Streamline
    // package both "V2", each shipping a file called config.ini. Deduping the
    // manifest on (variant, destination) alone would keep one and silently
    // drop the other, so one of the two groups would lose an entry.
    const id = ((await inject('POST', '/api/v1/admin/packages', {
      token: adminToken,
      body: { name: 'Name Clash', slug: 'aof-name-clash', kind: 'streamline' },
    })).json as { id: string }).id;

    await up(id, 'config.ini', { destination: 'config.ini', role: 'launcher', operation: 'replace', component: 'unlocker', variant: 'V2' });
    await up(id, 'config.ini', { destination: 'config.ini', role: 'streamline', operation: 'replace', component: 'streamline', variant: 'V2' });
    await inject('POST', `/api/v1/admin/packages/${id}/publish`, { token: adminToken, body: {} });

    const s = (await inject('GET', '/api/v1/mfg/tools/streamline')).json as {
      unlockers: { name: string }[];
      streamlines: { name: string }[];
    };
    expect(s.unlockers.map((c) => c.name), 'unlocker V2 was dropped').toEqual(['V2']);
    expect(s.streamlines.map((c) => c.name), 'streamline V2 was dropped').toEqual(['V2']);
  });
});

function awaitImportFs() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs') as typeof import('node:fs');
}
