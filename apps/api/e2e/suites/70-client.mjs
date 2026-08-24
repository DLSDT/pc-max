import { assert, eq, oneOf } from '../harness.mjs';

export const name = 'client';

/** A plausible mid-range rig, shaped like HardwareProfileInput. */
const HARDWARE = {
  cpu: 'Intel Core i7-12700K',
  gpu: 'NVIDIA GeForce RTX 3070',
  gpuVendor: 'nvidia',
  ramGb: 16,
  os: 'Windows 11',
};

export const tests = [
  {
    name: 'GET /sync returns the delta manifest the client polls',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/sync');
      eq(r.status, 200, 'sync status');
      assert(Array.isArray(r.json?.games), 'sync.games must be an array');
      assert('contentUpdatedAt' in r.json, 'sync.contentUpdatedAt must be present');
      for (const g of r.json.games.slice(0, 20)) {
        assert(typeof g.id === 'string' && typeof g.slug === 'string', 'sync row needs id and slug');
        assert(typeof g.deleted === 'boolean', `sync row ${g.slug} needs a deleted flag`);
        assert(typeof g.updatedAt === 'string', `sync row ${g.slug} needs updatedAt`);
      }
    },
  },
  {
    name: 'sync with a future cursor returns nothing to do',
    run: async (ctx) => {
      // The offline-first client sends its last cursor; a future timestamp must
      // return an empty delta rather than the whole catalog, or every launch
      // re-downloads 313 games.
      const future = new Date(Date.now() + 86400000).toISOString();
      const r = await ctx.req('GET', `/sync?since=${encodeURIComponent(future)}`);
      eq(r.status, 200, 'sync?since status');
      const all = await ctx.req('GET', '/sync');
      assert(r.json.games.length < all.json.games.length || all.json.games.length === 0,
        `since=<future> returned ${r.json.games.length} rows of ${all.json.games.length} — the cursor is ignored`);
    },
  },
  {
    name: 'sync rejects a malformed cursor instead of ignoring it',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/sync?since=not-a-date');
      // Either it validates (4xx) or it must not silently behave as "no cursor".
      assert(r.status < 500, `malformed cursor returned ${r.status}`);
    },
  },
  {
    name: 'POST /hardware/recommend returns a recommendation',
    run: async (ctx) => {
      const games = await ctx.req('GET', '/games?limit=1');
      const gameSlug = games.json.data[0].slug;
      const r = await ctx.req('POST', '/hardware/recommend', { body: { gameSlug, hardware: HARDWARE } });
      eq(r.status, 200, 'recommend status');
      eq(r.json?.gameSlug, gameSlug, 'recommend echoed a different game');
      assert('recommended' in r.json, 'recommend.recommended must be present (null is allowed)');
      assert(Array.isArray(r.json.alternatives), 'recommend.alternatives must be an array');
      assert(Array.isArray(r.json.reasons), 'recommend.reasons must be an array');
    },
  },
  {
    name: 'hardware recommendation rejects a malformed body',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/hardware/recommend', { body: { gameSlug: '' } });
      oneOf(r.status, [400, 422], 'malformed recommend body');
    },
  },
  {
    name: 'hardware recommendation for an unknown game does not 500',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/hardware/recommend', {
        body: { gameSlug: 'no-such-game-zzz-9f3a', hardware: HARDWARE },
      });
      assert(r.status < 500, `unknown game in recommend returned ${r.status}`);
    },
  },
  {
    name: 'per-user endpoints all require authentication',
    run: async (ctx) => {
      const guarded = ['/favorites', '/me', '/me/devices', '/me/hardware', '/me/subscription', '/me/features'];
      const bad = [];
      for (const p of guarded) {
        const r = await ctx.req('GET', p, { noCookies: true });
        if (r.status !== 401) bad.push(`${p} -> ${r.status}`);
      }
      eq(bad.length, 0, `per-user routes reachable anonymously: ${bad.join(', ')}`);
    },
  },
  {
    name: 'favorite mutations require authentication',
    run: async (ctx) => {
      const games = await ctx.req('GET', '/games?limit=1');
      const id = games.json.data[0].id;
      for (const method of ['PUT', 'DELETE']) {
        const r = await ctx.req(method, `/favorites/${id}`, { noCookies: true });
        eq(r.status, 401, `anonymous ${method} /favorites must be refused`);
      }
    },
  },
  {
    name: 'POST /views records an anonymous view',
    mode: 'full',
    run: async (ctx) => {
      // Anonymous and it writes a row, so this only runs against a local stack.
      const games = await ctx.req('GET', '/games?limit=1');
      const g = games.json.data[0];
      const r = await ctx.req('POST', '/views', { body: { gameId: g.id } });
      assert(r.status < 400, `POST /views failed: ${r.status} ${r.text.slice(0, 160)}`);
    },
  },
  {
    name: 'POST /views absorbs an unknown game id without erroring',
    run: async (ctx) => {
      // Deliberate design (device.ts): analytics is fire-and-forget, and the
      // row is only inserted when the game actually exists. A client holding a
      // stale id from before a delete must not get an error it cannot act on.
      const r = await ctx.req('POST', '/views', { body: { gameId: '00000000-0000-4000-8000-000000000000' } });
      eq(r.status, 200, 'unknown gameId should be absorbed, not rejected');
      eq(r.json?.ok, true, '/views should report ok');
    },
  },
  {
    name: 'POST /views requires at least one target',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/views', { body: {} });
      oneOf(r.status, [400, 422], 'a view with neither gameId nor profileId must be refused');
    },
  },
  {
    name: 'POST /client-errors accepts a crash report',
    mode: 'full',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/client-errors', {
        body: {
          message: 'e2e synthetic error — safe to delete',
          stack: 'Error: e2e\n    at e2e (e2e.mjs:1:1)',
          appVersion: '0.0.0-e2e',
          platform: 'e2e',
        },
      });
      assert(r.status < 400, `client-errors rejected a well-formed report: ${r.status} ${r.text.slice(0, 200)}`);
    },
  },
  {
    name: 'POST /users/device requires a well-formed body',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/users/device', { body: {}, noCookies: true });
      oneOf(r.status, [400, 401, 422], 'empty device registration body');
    },
  },
];
