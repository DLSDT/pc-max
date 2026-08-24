import { assert, eq, oneOf } from '../harness.mjs';

export const name = 'auth';

export const tests = [
  {
    name: 'login with wrong credentials is rejected',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/auth/login', {
        body: { identifier: 'e2e-nobody-8f3a2b@example.invalid', password: 'definitely-not-the-password' },
        noCookies: true,
      });
      oneOf(r.status, [401, 400, 422], 'bad-credentials login status');
      // The reply must not reveal whether the account exists — that turns the
      // login form into an account-enumeration oracle.
      assert(!/not found|no such (user|account)|does not exist/i.test(r.text),
        `login error leaks account existence: ${r.text.slice(0, 160)}`);
    },
  },
  {
    name: 'login with a malformed body is rejected before auth',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/auth/login', { body: { identifier: '' }, noCookies: true });
      oneOf(r.status, [400, 422], 'malformed login status');
      assert(r.json?.error, 'expected a structured error envelope');
    },
  },
  {
    name: 'GET /auth/me without a token is 401',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/auth/me', { noCookies: true });
      eq(r.status, 401, 'unauthenticated /auth/me');
    },
  },
  {
    name: 'GET /auth/me with a garbage bearer token is 401',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/auth/me', { token: 'not.a.jwt', noCookies: true });
      eq(r.status, 401, 'garbage-token /auth/me');
    },
  },
  {
    name: 'a tampered JWT signature is rejected',
    run: async (ctx) => {
      // Take a real admin token and flip the signature. If this is accepted,
      // anyone can mint their own admin.
      const good = await ctx.adminToken();
      const parts = good.split('.');
      const forged = `${parts[0]}.${parts[1]}.${'A'.repeat(parts[2].length)}`;
      const r = await ctx.req('GET', '/admin/auth/me', { token: forged, noCookies: true });
      eq(r.status, 401, 'forged-signature token must be rejected');
    },
  },
  {
    name: 'an alg=none token is rejected',
    run: async (ctx) => {
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'anyone', kind: 'admin', role: 'super_admin' })}.`;
      const r = await ctx.req('GET', '/admin/auth/me', { token: forged, noCookies: true });
      eq(r.status, 401, 'alg=none token must be rejected');
    },
  },
  {
    name: 'POST /auth/refresh without a cookie is 401',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/auth/refresh', { noCookies: true });
      oneOf(r.status, [401, 400], 'refresh without cookie');
    },
  },
  {
    name: 'admin login issues a usable short-lived token',
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      assert(typeof tok === 'string' && tok.split('.').length === 3, 'admin token must be a JWT');
      const claims = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString());
      eq(claims.kind, 'admin', 'token kind');
      const ttl = claims.exp - claims.iat;
      // A long-lived access token cannot be revoked; the design is short TTL
      // plus refresh. 1 hour is the outside of reasonable.
      assert(ttl > 0 && ttl <= 3600, `admin access token TTL is ${ttl}s — too long to be unrevocable`);
    },
  },
  {
    name: 'GET /admin/auth/me returns the admin identity and permissions',
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const r = await ctx.req('GET', '/admin/auth/me', { token: tok });
      eq(r.status, 200, 'admin/auth/me status');
      const a = r.json?.admin ?? r.json?.data ?? r.json;
      assert(typeof a.email === 'string', 'admin.email');
      assert(Array.isArray(a.permissions) && a.permissions.length > 0, 'admin.permissions must be a non-empty array');
      assert(!('passwordHash' in a) && !('password' in a), 'admin identity must never carry a password field');
    },
  },
  {
    name: 'a user-kind token cannot reach an admin route',
    run: async (ctx) => {
      // Re-sign is impossible without the secret, so instead assert the guard
      // rejects a structurally valid token whose kind is wrong.
      const tok = await ctx.adminToken();
      const [h, , s] = tok.split('.');
      const claims = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString());
      const swapped = Buffer.from(JSON.stringify({ ...claims, kind: 'user', role: 'user' })).toString('base64url');
      const r = await ctx.req('GET', '/admin/dashboard', { token: `${h}.${swapped}.${s}`, noCookies: true });
      eq(r.status, 401, 'a token with edited claims must fail signature verification');
    },
  },
  {
    name: 'OTP send rejects a malformed identifier',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/auth/otp/send', { body: { identifier: 'not-an-email' }, noCookies: true });
      oneOf(r.status, [400, 422], 'malformed OTP identifier');
    },
  },
  {
    name: 'password reset for an unknown address does not confirm or deny it',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/auth/password/forgot', {
        body: { identifier: 'e2e-nobody-8f3a2b@example.invalid' },
        noCookies: true,
      });
      // Whether it 200s or 202s, it must not say "no such account" — same
      // enumeration concern as login.
      oneOf(r.status, [200, 202, 204, 400, 422], 'forgot-password status');
      if (r.status < 300) {
        assert(!/not found|no such|does not exist/i.test(r.text),
          `forgot-password leaks account existence: ${r.text.slice(0, 160)}`);
      }
    },
  },
  {
    name: 'password reset with a bogus token is refused',
    run: async (ctx) => {
      const r = await ctx.req('POST', '/auth/password/reset', {
        body: { token: 'bogus-reset-token-9f3a2b', password: 'NewPassword123!' },
        noCookies: true,
      });
      oneOf(r.status, [400, 401, 403, 404, 422], 'bogus reset token status');
      assert(r.status !== 200, 'a bogus reset token must never succeed');
    },
  },
];
