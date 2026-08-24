import { assert, eq } from '../harness.mjs';

export const name = 'catalog';

/** The frame rate each preset aims at. Mirrors scripts/apply-target-fps.ts. */
const TARGET_FPS = { ray_tracing: 60, green: 90, yellow: 120, multiplay: 144 };

async function anySlug(ctx) {
  if (ctx.shared.has('gameSlug')) return ctx.shared.get('gameSlug');
  const r = await ctx.req('GET', '/games?limit=1');
  const slug = r.json?.data?.[0]?.slug;
  assert(slug, 'could not discover any game slug — catalog is empty?');
  ctx.shared.set('gameSlug', slug);
  return slug;
}

export const tests = [
  {
    name: 'GET /games paginates with self-consistent meta',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/games?limit=5&page=1');
      eq(r.status, 200, 'games status');
      assert(Array.isArray(r.json?.data), 'games.data must be an array');
      const m = r.json?.meta;
      assert(m, 'games.meta missing');
      eq(m.page, 1, 'meta.page');
      eq(m.limit, 5, 'meta.limit');
      assert(Number.isInteger(m.total) && m.total > 0, 'meta.total must be a positive integer');
      assert(r.json.data.length <= 5, 'returned more rows than the requested limit');
    },
  },
  {
    name: 'page 2 returns different games and the same total',
    run: async (ctx) => {
      const [p1, p2] = await Promise.all([
        ctx.req('GET', '/games?limit=5&page=1'),
        ctx.req('GET', '/games?limit=5&page=2'),
      ]);
      eq(p2.json?.meta?.total, p1.json?.meta?.total, 'total must not change between pages');
      const ids1 = new Set(p1.json.data.map((g) => g.id));
      const overlap = p2.json.data.filter((g) => ids1.has(g.id));
      // An unstable sort makes paging skip and repeat rows, which the client
      // sees as games randomly missing from the list.
      eq(overlap.length, 0, `page 2 repeated ${overlap.length} game(s) from page 1 — unstable ordering`);
    },
  },
  {
    name: 'every game row carries the fields the list UI renders',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/games?limit=20');
      for (const g of r.json.data) {
        assert(typeof g.id === 'string' && g.id.length > 0, 'game.id');
        assert(typeof g.slug === 'string' && g.slug.length > 0, `game ${g.id} slug`);
        assert(typeof g.name === 'string' && g.name.length > 0, `game ${g.slug} name`);
        assert(Array.isArray(g.genres), `game ${g.slug} genres must be an array`);
        assert(g.technologies && typeof g.technologies === 'object', `game ${g.slug} technologies`);
      }
    },
  },
  {
    name: 'GET /games/{slug} returns the game',
    run: async (ctx) => {
      const slug = await anySlug(ctx);
      const r = await ctx.req('GET', `/games/${slug}`);
      eq(r.status, 200, 'game detail status');
      eq(r.json?.slug, slug, 'detail returned a different slug');
    },
  },
  {
    name: 'unknown slug returns 404 NOT_FOUND',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/games/no-such-game-zzz-9f3a');
      eq(r.status, 404, 'unknown game status');
      eq(r.json?.error?.code, 'NOT_FOUND', 'error.code');
    },
  },
  {
    name: 'GET /games/{slug}/optimizations returns profiles with settings',
    run: async (ctx) => {
      const slug = await anySlug(ctx);
      const r = await ctx.req('GET', `/games/${slug}/optimizations`);
      eq(r.status, 200, 'optimizations status');
      const list = r.json?.data;
      assert(Array.isArray(list) && list.length > 0, `${slug} returned no optimization profiles`);
      for (const p of list) {
        assert(typeof p.slug === 'string', 'profile.slug');
        assert(Array.isArray(p.settings), `profile ${p.slug} settings must be an array`);
        eq(p.status, 'published', `profile ${p.slug} must be published on a public route`);
      }
    },
  },
  {
    name: 'every published profile has a targetFps matching its preset',
    run: async (ctx) => {
      // Regression guard: all 119 profiles shipped with target_fps NULL, which
      // the detail page rendered as "—". The value is derived from the preset,
      // so a wrong number here means apply-target-fps did not run after deploy.
      const games = await ctx.req('GET', '/games?limit=25');
      const offenders = [];
      let checked = 0;
      for (const g of games.json.data) {
        const r = await ctx.req('GET', `/games/${g.slug}/optimizations`);
        for (const p of r.json?.data ?? []) {
          checked++;
          const want = TARGET_FPS[p.colorProfile];
          if (want === undefined) {
            offenders.push(`${g.slug}/${p.slug}: unknown colorProfile ${JSON.stringify(p.colorProfile)}`);
          } else if (p.targetFps !== want) {
            offenders.push(`${g.slug}/${p.slug}: ${p.colorProfile} has targetFps ${JSON.stringify(p.targetFps)}, expected ${want}`);
          }
        }
      }
      assert(checked > 0, 'no profiles were checked');
      eq(offenders.length, 0, `targetFps wrong on ${offenders.length}/${checked} profile(s):\n      ${offenders.slice(0, 8).join('\n      ')}`);
    },
  },
  {
    name: 'GET /games/{slug}/optimizations/{profileSlug} returns one profile',
    run: async (ctx) => {
      const slug = await anySlug(ctx);
      const list = await ctx.req('GET', `/games/${slug}/optimizations`);
      const p = list.json.data[0];
      const r = await ctx.req('GET', `/games/${slug}/optimizations/${p.slug}`);
      eq(r.status, 200, 'single profile status');
      const got = r.json?.data ?? r.json;
      eq(got.slug, p.slug, 'returned a different profile');
      assert(Array.isArray(got.settings) && got.settings.length > 0, 'profile must carry its settings');
    },
  },
  {
    name: 'GET /games/cached agrees with /games on total',
    run: async (ctx) => {
      const [live, cached] = await Promise.all([
        ctx.req('GET', '/games?limit=1'),
        ctx.req('GET', '/games/cached?limit=1'),
      ]);
      eq(cached.status, 200, 'games/cached status');
      const ct = cached.json?.meta?.total ?? cached.json?.total;
      if (ct !== undefined) eq(ct, live.json.meta.total, 'cached total drifted from live total');
    },
  },
  {
    name: 'GET /optimized-setting/games lists only games that have profiles',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/optimized-setting/games?limit=10');
      eq(r.status, 200, 'optimized-setting/games status');
      const list = r.json?.data;
      assert(Array.isArray(list) && list.length > 0, 'expected at least one optimized game');
      // Spot-check the first: appearing here but having no profiles is the bug
      // this endpoint exists to prevent.
      const opt = await ctx.req('GET', `/games/${list[0].slug}/optimizations`);
      assert((opt.json?.data ?? []).length > 0, `${list[0].slug} is listed as optimized but has no profiles`);
    },
  },
  {
    name: 'limit is bounded (a huge limit must not dump the whole table)',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/games?limit=100000');
      // Either the schema rejects it or the server clamps it. Both are fine;
      // returning 313 rows on an unbounded limit is not.
      if (r.status === 200) {
        assert(r.json.data.length <= 200, `limit=100000 returned ${r.json.data.length} rows — not clamped`);
      } else {
        assert(r.status === 400 || r.status === 422, `expected a clamp or a 4xx, got ${r.status}`);
      }
    },
  },
];
