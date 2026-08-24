import { assert, eq, oneOf } from '../harness.mjs';

export const name = 'admin';

/** Admin list routes that must all answer with a { data: [...] } envelope. */
const LIST_ROUTES = [
  '/admin/users',
  '/admin/games',
  '/admin/packages',
  '/admin/subscriptions',
  '/admin/subscriptions/plans',
  '/admin/payments',
  '/admin/audit-logs',
  '/admin/devices',
  '/admin/client-errors',
  '/admin/categories',
  '/admin/tags',
  '/admin/optimization-categories',
  '/admin/app-versions',
  '/admin/admins',
  '/admin/security/login-attempts',
  '/admin/email/logs',
];

export const tests = [
  {
    name: 'GET /admin/dashboard returns coherent stats',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const r = await ctx.req('GET', '/admin/dashboard', { token: tok });
      eq(r.status, 200, 'dashboard status');
      const s = r.json?.stats;
      assert(s, 'dashboard.stats missing');
      for (const k of ['totalUsers', 'totalGames', 'publishedGames', 'totalProfiles', 'totalViews']) {
        assert(Number.isInteger(s[k]) && s[k] >= 0, `stats.${k} must be a non-negative integer`);
      }
      assert(s.publishedGames <= s.totalGames, 'publishedGames cannot exceed totalGames');
      assert(Array.isArray(r.json?.topGames), 'dashboard.topGames must be an array');
    },
  },
  {
    name: 'dashboard game count agrees with the public catalog',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const [dash, pub] = await Promise.all([
        ctx.req('GET', '/admin/dashboard', { token: tok }),
        ctx.req('GET', '/games?limit=1'),
      ]);
      // The public list shows published games; the dashboard counts them
      // separately. A mismatch means one of the two queries is wrong.
      eq(pub.json.meta.total, dash.json.stats.publishedGames,
        'public catalog total disagrees with dashboard publishedGames');
    },
  },
  {
    name: 'every admin list route answers with a data envelope',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const bad = [];
      for (const p of LIST_ROUTES) {
        const r = await ctx.req('GET', p, { token: tok });
        if (r.status !== 200) { bad.push(`${p} -> ${r.status}`); continue; }
        const d = r.json?.data;
        if (!Array.isArray(d)) bad.push(`${p} -> .data is ${typeof d}, expected array`);
      }
      eq(bad.length, 0, `admin list routes misbehaving: ${bad.join(', ')}`);
    },
  },
  {
    name: 'GET /admin/settings returns the settings map',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const r = await ctx.req('GET', '/admin/settings', { token: tok });
      eq(r.status, 200, 'admin settings status');
      const d = r.json?.data;
      assert(d && typeof d === 'object' && !Array.isArray(d), 'admin settings .data must be an object map');
      for (const k of ['announcement', 'maintenance_mode', 'min_app_version', 'branding']) {
        assert(d[k] !== undefined, `admin settings.${k} missing`);
      }
    },
  },
  {
    name: 'admin settings and public /config agree',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const [adm, pub] = await Promise.all([
        ctx.req('GET', '/admin/settings', { token: tok }),
        ctx.req('GET', '/config'),
      ]);
      // The admin panel edits these and the client reads them; a divergence
      // means an admin change never reaches users.
      eq(pub.json.data.maintenance_mode.enabled, adm.json.data.maintenance_mode.enabled, 'maintenance_mode drifted');
      eq(pub.json.data.min_app_version.version, adm.json.data.min_app_version.version, 'min_app_version drifted');
    },
  },
  {
    name: 'GET /admin/email/status reports a configured transport',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const r = await ctx.req('GET', '/admin/email/status', { token: tok });
      eq(r.status, 200, 'email status');
      assert(typeof r.json?.provider === 'string', 'email.provider');
      assert(typeof r.json?.configured === 'boolean', 'email.configured');
      // `development: true` means mail is only printed to the log — an install
      // in that state silently never delivers an OTP to anyone.
      if (r.json.provider !== 'console') {
        eq(r.json.development, false, 'a non-console provider must not be in development mode');
        eq(r.json.configured, true, 'a non-console provider must be fully configured');
      }
    },
  },
  {
    name: 'GET /admin/email/logs never returns a full address',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const r = await ctx.req('GET', '/admin/email/logs', { token: tok });
      eq(r.status, 200, 'email logs status');
      const rows = r.json?.data;
      assert(Array.isArray(rows), 'email logs .data must be an array');
      for (const row of rows) {
        assert(typeof row.recipient === 'string', 'log row needs a recipient');
        // The column stores it already masked; an unmasked address here means
        // the write path regressed, not just the read path.
        assert(row.recipient.includes('*'),
          `email log recipient is not masked: ${row.recipient}`);
        oneOf(row.status, ['sent', 'failed', 'queued', 'skipped'], `log row status ${row.status}`);
        assert(typeof row.event === 'string' && row.event.length > 0, 'log row needs an event');
      }
    },
  },
  {
    name: 'GET /admin/security/login-attempts records outcomes',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const r = await ctx.req('GET', '/admin/security/login-attempts', { token: tok });
      eq(r.status, 200, 'login attempts status');
      for (const row of (r.json?.data ?? []).slice(0, 20)) {
        assert(typeof row.success === 'boolean', 'attempt.success must be boolean');
        assert(typeof row.attemptedAt === 'string', 'attempt.attemptedAt must be present');
        assert(!('password' in row) && !('passwordHash' in row), 'a login attempt row must never carry a password');
      }
    },
  },
  {
    name: 'GET /admin/audit-logs attributes each action to an admin',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const r = await ctx.req('GET', '/admin/audit-logs', { token: tok });
      eq(r.status, 200, 'audit logs status');
      for (const row of (r.json?.data ?? []).slice(0, 20)) {
        assert(typeof row.action === 'string' && row.action.length > 0, 'audit.action');
        assert(typeof row.entityType === 'string', 'audit.entityType');
        // An audit trail with no actor cannot answer the question it exists for.
        assert(row.admin && typeof row.admin.id === 'string', `audit row ${row.action} has no admin attributed`);
      }
    },
  },
  {
    name: 'admin user list never exposes password material',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const r = await ctx.req('GET', '/admin/users', { token: tok });
      eq(r.status, 200, 'admin users status');
      for (const u of (r.json?.data ?? []).slice(0, 25)) {
        for (const forbidden of ['password', 'passwordHash', 'password_hash', 'otp', 'otpHash']) {
          assert(!(forbidden in u), `admin user row leaks ${forbidden}`);
        }
      }
    },
  },
  {
    name: 'a tag can be created, read back and deleted',
    mode: 'full',
    admin: true,
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const slug = `e2e-tag-${Math.random().toString(36).slice(2, 8)}`;
      let id = null;
      try {
        const created = await ctx.req('POST', '/admin/tags', {
          token: tok,
          body: { slug, name: `E2E ${slug}` },
        });
        assert(created.status < 300, `tag create failed: ${created.status} ${created.text.slice(0, 200)}`);
        id = (created.json?.data ?? created.json)?.id;
        assert(id, 'tag create returned no id');

        const list = await ctx.req('GET', '/admin/tags', { token: tok });
        assert(list.json.data.some((t) => t.slug === slug), 'created tag did not appear in the list');
      } finally {
        if (id) {
          const del = await ctx.req('DELETE', `/admin/tags/${id}`, { token: tok });
          assert(del.status < 300 || del.status === 404, `tag cleanup failed: ${del.status}`);
        }
      }
    },
  },
];
