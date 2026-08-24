import { assert, eq, oneOf } from '../harness.mjs';

export const name = 'system';

/** The docs live off the versioned prefix, so strip it off ctx.base. */
function root(ctx) {
  return ctx.base.replace(/\/api\/v1$/, '');
}

export const tests = [
  {
    name: 'GET /health reports ok with a numeric uptime',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/health');
      eq(r.status, 200, 'health status');
      eq(r.json?.status, 'ok', 'health.status');
      assert(typeof r.json?.uptime === 'number' && r.json.uptime > 0, 'health.uptime must be a positive number');
    },
  },
  {
    name: 'GET /config exposes the client bootstrap block',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/config');
      eq(r.status, 200, 'config status');
      const d = r.json?.data;
      assert(d, 'config must be under .data');
      // The desktop app reads these on every launch; a missing key is a crash
      // on the client, not a graceful degradation.
      for (const key of ['announcement', 'maintenance_mode', 'min_app_version', 'branding', 'support']) {
        assert(d[key] !== undefined, `config.data.${key} missing`);
      }
      assert(typeof d.maintenance_mode.enabled === 'boolean', 'maintenance_mode.enabled must be boolean');
      assert(typeof d.min_app_version.version === 'string', 'min_app_version.version must be a string');
      assert(typeof d.branding.brand_name === 'string' && d.branding.brand_name.length > 0, 'branding.brand_name must be set');
    },
  },
  {
    name: 'maintenance mode is OFF (a stuck flag locks every client out)',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/config');
      eq(r.json?.data?.maintenance_mode?.enabled, false, 'maintenance_mode left enabled');
    },
  },
  {
    name: 'min_app_version is not above the shipping version',
    run: async (ctx) => {
      // If this drifts above what users actually have installed, every one of
      // them is hard-blocked at launch with no way to self-recover.
      const r = await ctx.req('GET', '/config');
      const v = r.json?.data?.min_app_version?.version;
      assert(/^\d+\.\d+\.\d+$/.test(v), `min_app_version must be semver, got ${JSON.stringify(v)}`);
      const [maj] = v.split('.').map(Number);
      assert(maj <= 1, `min_app_version ${v} looks higher than any released build`);
    },
  },
  {
    name: 'GET /settings returns the app identity block',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/settings');
      eq(r.status, 200, 'settings status');
      // Note: this one is a bare object, not wrapped in .data.
      assert(typeof r.json?.appName === 'string', 'settings.appName');
      eq(r.json?.apiVersion, 'v1', 'settings.apiVersion');
    },
  },
  {
    name: 'GET /categories returns categories with game counts',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/categories');
      eq(r.status, 200, 'categories status');
      const list = r.json?.data;
      assert(Array.isArray(list) && list.length > 0, 'categories must be a non-empty array');
      for (const c of list) {
        assert(typeof c.slug === 'string' && c.slug.length > 0, 'category.slug');
        assert(typeof c.name === 'string' && c.name.length > 0, 'category.name');
        assert(Number.isInteger(c.gameCount) && c.gameCount >= 0, `category ${c.slug} gameCount must be a non-negative integer`);
      }
      const slugs = list.map((c) => c.slug);
      eq(new Set(slugs).size, slugs.length, 'category slugs must be unique');
    },
  },
  {
    name: 'GET /featured returns published games only',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/featured');
      eq(r.status, 200, 'featured status');
      const list = r.json?.data;
      assert(Array.isArray(list), 'featured.data must be an array');
      for (const g of list) {
        assert(typeof g.slug === 'string', 'featured game needs a slug');
        // A draft leaking onto the home screen is a content bug users see.
        if (g.status !== undefined) eq(g.status, 'published', `featured game ${g.slug} must be published`);
      }
    },
  },
  {
    name: 'GET /home and /home/cached agree',
    run: async (ctx) => {
      const [live, cached] = await Promise.all([
        ctx.req('GET', '/home'),
        ctx.req('GET', '/home/cached'),
      ]);
      eq(live.status, 200, 'home status');
      eq(cached.status, 200, 'home/cached status');
      // The cache exists to cut latency, not to serve a different shape — a
      // divergence here shows up as the home screen changing on refresh.
      const keysOf = (r) => Object.keys(r.json?.data ?? r.json ?? {}).sort().join(',');
      eq(keysOf(cached), keysOf(live), 'home/cached must have the same top-level keys as /home');
    },
  },
  {
    name: 'GET /app/version answers with a well-formed update verdict',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/app/version');
      eq(r.status, 200, 'app/version status');
      assert(typeof r.json?.updateAvailable === 'boolean', 'app/version.updateAvailable must be boolean');
      assert('latest' in r.json, 'app/version.latest key must be present (null is fine)');
    },
  },
  {
    name: 'OpenAPI spec is served and covers the versioned API',
    run: async (ctx) => {
      const r = await ctx.req('GET', `${root(ctx)}/docs/json`);
      eq(r.status, 200, 'docs/json status');
      assert(r.json?.openapi?.startsWith('3.'), 'docs/json must be an OpenAPI 3 document');
      const paths = Object.keys(r.json?.paths ?? {});
      assert(paths.length > 50, `expected a large path set, got ${paths.length}`);
      assert(paths.every((p) => p.startsWith('/api/v1')), 'every documented path should sit under /api/v1');
    },
  },
  {
    name: 'unknown route returns a clean 404, not an HTML error page',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/definitely-not-a-route-9f3a');
      eq(r.status, 404, 'unknown route status');
      assert(!/<html/i.test(r.text), 'a 404 must not be an HTML page — clients parse JSON');
    },
  },
];
