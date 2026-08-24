import { assert, eq, oneOf } from '../harness.mjs';

export const name = 'security';

/** Admin paths sampled across modules — enough to prove the guard is global. */
const ADMIN_PATHS = [
  '/admin/dashboard',
  '/admin/users',
  '/admin/games',
  '/admin/packages',
  '/admin/payments',
  '/admin/audit-logs',
  '/admin/settings',
  '/admin/admins',
  '/admin/devices',
  '/admin/email/logs',
  '/admin/security/login-attempts',
  '/admin/subscriptions',
];

export const tests = [
  {
    name: 'security headers are present on API responses',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/health');
      const want = {
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'x-permitted-cross-domain-policies': 'none',
        'cross-origin-opener-policy': 'same-origin',
      };
      for (const [h, v] of Object.entries(want)) {
        eq(r.headers.get(h), v, `header ${h}`);
      }
    },
  },
  {
    name: 'HSTS is set when served over TLS',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/health');
      const hsts = r.headers.get('strict-transport-security');
      if (ctx.base.startsWith('https://')) {
        assert(hsts && /max-age=\d+/.test(hsts), `HSTS missing on a TLS deployment: ${hsts}`);
        const age = Number(/max-age=(\d+)/.exec(hsts)[1]);
        assert(age >= 15552000, `HSTS max-age ${age} is below the 180-day baseline`);
      }
    },
  },
  {
    name: 'the desktop app origin is allowed by CORS',
    run: async (ctx) => {
      // tauri://localhost is what every installed build sends. If this stops
      // being reflected, every install breaks at once with a network error.
      for (const origin of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
        const r = await ctx.req('GET', '/health', { headers: { Origin: origin } });
        eq(r.headers.get('access-control-allow-origin'), origin, `CORS must allow ${origin}`);
      }
    },
  },
  {
    name: 'a preflight from the desktop origin succeeds',
    run: async (ctx) => {
      const r = await ctx.req('OPTIONS', '/auth/login', {
        headers: {
          Origin: 'tauri://localhost',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
      oneOf(r.status, [200, 204], 'preflight status');
      eq(r.headers.get('access-control-allow-origin'), 'tauri://localhost', 'preflight allow-origin');
      assert(/POST/i.test(r.headers.get('access-control-allow-methods') ?? ''), 'preflight must allow POST');
    },
  },
  {
    name: 'an unknown origin is not reflected',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/health', { headers: { Origin: 'https://evil.example' } });
      const allowed = r.headers.get('access-control-allow-origin');
      assert(allowed !== 'https://evil.example', 'CORS reflected an untrusted origin');
      assert(allowed !== '*', 'CORS must not be a wildcard when credentials are allowed');
    },
  },
  {
    name: 'every admin route rejects an anonymous request',
    run: async (ctx) => {
      // 404 counts as refused: the route is not registered on this build, so it
      // is not an auth hole. Whether it *should* exist is the admin suite's
      // job — conflating the two hides a real auth regression behind a
      // deployment-lag failure.
      const bad = [];
      for (const p of ADMIN_PATHS) {
        const r = await ctx.req('GET', p, { noCookies: true });
        if (![401, 404].includes(r.status)) bad.push(`${p} -> ${r.status}`);
      }
      eq(bad.length, 0, `admin routes reachable without auth: ${bad.join(', ')}`);
    },
  },
  {
    name: 'every admin route rejects a garbage token',
    run: async (ctx) => {
      const bad = [];
      for (const p of ADMIN_PATHS) {
        const r = await ctx.req('GET', p, { token: 'not.a.real.token', noCookies: true });
        if (![401, 403, 404].includes(r.status)) bad.push(`${p} -> ${r.status}`);
      }
      eq(bad.length, 0, `admin routes accepted a garbage token: ${bad.join(', ')}`);
    },
  },
  {
    name: 'a tampered signed-upload URL is refused',
    run: async (ctx) => {
      const future = Math.floor(Date.now() / 1000) + 3600;
      const r = await ctx.req('GET', `/uploads/signed/${future}/deadbeefdeadbeef/some-file.zip`);
      oneOf(r.status, [401, 403, 404], 'bogus signature must not serve a file');
      assert(r.status !== 200, 'a forged signature served content');
    },
  },
  {
    name: 'an expired signed-upload URL is refused',
    run: async (ctx) => {
      const past = Math.floor(Date.now() / 1000) - 3600;
      const r = await ctx.req('GET', `/uploads/signed/${past}/deadbeefdeadbeef/some-file.zip`);
      oneOf(r.status, [401, 403, 404], 'expired signature must not serve a file');
    },
  },
  {
    name: 'path traversal through the signed-upload path is refused',
    run: async (ctx) => {
      const future = Math.floor(Date.now() / 1000) + 3600;
      for (const evil of ['../../etc/passwd', '..%2f..%2fetc%2fpasswd']) {
        const r = await ctx.req('GET', `/uploads/signed/${future}/deadbeef/${evil}`);
        assert(r.status !== 200, `traversal served content for ${evil}`);
        assert(!/root:x:/.test(r.text), `traversal leaked /etc/passwd for ${evil}`);
      }
    },
  },
  {
    name: 'error responses never leak a stack trace or a server path',
    run: async (ctx) => {
      const probes = [
        ['GET', '/games/%00'],
        ['POST', '/auth/login'],
        ['GET', '/games?limit=notanumber'],
        ['POST', '/hardware/recommend'],
      ];
      for (const [method, path] of probes) {
        const r = await ctx.req(method, path, { body: method === 'POST' ? {} : undefined, noCookies: true });
        assert(!/\bat\s+\w+\s+\(/.test(r.text), `stack trace leaked from ${method} ${path}: ${r.text.slice(0, 200)}`);
        assert(!/\/app\/apps\/api|\/home\/[a-z]+\//.test(r.text), `server path leaked from ${method} ${path}: ${r.text.slice(0, 200)}`);
      }
    },
  },
  {
    name: 'rate-limit headers are advertised',
    run: async (ctx) => {
      // Asserting the headers exist rather than tripping the limiter — hammering
      // it would degrade the live server for real users.
      const r = await ctx.req('GET', '/health');
      const limit = r.headers.get('x-ratelimit-limit');
      assert(limit, 'x-ratelimit-limit header missing — is the limiter registered?');
      assert(Number(limit) > 0, `x-ratelimit-limit must be positive, got ${limit}`);
      assert(r.headers.get('x-ratelimit-remaining') !== null, 'x-ratelimit-remaining missing');
    },
  },
  {
    name: 'the API does not advertise its server software',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/health');
      const powered = r.headers.get('x-powered-by');
      assert(!powered, `x-powered-by leaks the stack: ${powered}`);
    },
  },
];
