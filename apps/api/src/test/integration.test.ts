import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { FastifyInstance } from 'fastify';

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

let pg: EmbeddedPostgres;
let app: FastifyInstance;

async function inject(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, opts: { body?: unknown; token?: string } = {}) {
  const res = await app.inject({
    method,
    url,
    payload: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    headers: {
      'content-type': 'application/json',
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
    expect(data.popular.length).toBe(12);
    expect(data.recentlyAdded.length).toBe(12);
    expect(data.categories.length).toBeGreaterThan(0);
  });

  it('searches games by name, genre and tag', async () => {
    const byName = await inject('GET', '/api/v1/games?q=gta');
    expect((byName.json.data as { slug: string }[]).some((g) => g.slug === 'gta-v')).toBe(true);

    const byGenre = await inject('GET', '/api/v1/games?genre=open-world');
    expect((byGenre.json.data as unknown[]).length).toBeGreaterThan(1);

    const byTag = await inject('GET', '/api/v1/games?q=difficult');
    expect((byTag.json.data as unknown[]).length).toBeGreaterThan(0);

    const bySlug = await inject('GET', '/api/v1/games?q=doom');
    expect((bySlug.json.data as { slug: string }[]).some((g) => g.slug === 'doom')).toBe(true);
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
    expect(data.games.length).toBe(14);
    expect(data.profiles.length).toBe(56);
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
    expect(stats.totalGames).toBe(14);
    expect(stats.totalProfiles).toBe(56);
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
