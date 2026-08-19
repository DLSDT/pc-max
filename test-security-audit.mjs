#!/usr/bin/env node
/**
 * PC MAX — full security & authorization audit.
 * Exercises the real running API: auth lifecycle, admin authorization on EVERY
 * admin route, IDOR, injection attempts, rate limiting, and data leakage.
 */

const BASE = 'http://127.0.0.1:4000/api/v1';

let pass = 0, fail = 0;
const failures = [];

function ok(cond, msg, detail = '') {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
  else { fail++; failures.push(msg + (detail ? ` — ${detail}` : '')); console.log(`  \x1b[31m✗ FAIL\x1b[0m ${msg}${detail ? ` — ${detail}` : ''}`); }
}

function section(name) { console.log(`\n\x1b[1m\x1b[36m=== ${name} ===\x1b[0m`); }

async function req(method, path, { body, token, cookie, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? (raw ?? JSON.stringify(body)) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, json, text, setCookie, headers: res.headers };
}

// ─────────────────────────────────────────────────────────────
section('1. Admin authentication lifecycle');

const adminLogin = await req('POST', '/auth/login', {
  body: { identifier: 'admin@gmail.com', password: 'admin123' },
});
ok(adminLogin.status === 200, 'admin login succeeds', `got ${adminLogin.status}`);
ok(adminLogin.json?.user?.role === 'admin', 'admin login returns role=admin');
const ADMIN_TOKEN = adminLogin.json?.adminAccessToken;
const ADMIN_USER_TOKEN = adminLogin.json?.accessToken;
ok(typeof ADMIN_TOKEN === 'string' && ADMIN_TOKEN.length > 20, 'adminAccessToken issued');
ok(typeof ADMIN_USER_TOKEN === 'string', 'user-kind accessToken also issued');
const adminCookie = adminLogin.setCookie.map(c => c.split(';')[0]).join('; ');
ok(adminCookie.includes('goh_refresh'), 'httpOnly refresh cookie set');
ok(adminLogin.setCookie.some(c => /httponly/i.test(c)), 'refresh cookie is HttpOnly');
ok(adminLogin.setCookie.some(c => /samesite=strict/i.test(c)), 'refresh cookie is SameSite=Strict');
ok(!JSON.stringify(adminLogin.json).match(/passwordHash|password_hash/i), 'login response never leaks password hash');
ok(!JSON.stringify(adminLogin.json).match(/admin123/), 'login response never echoes the password');

// JWT payload inspection — no secrets inside
function decodeJwt(t) {
  try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()); } catch { return null; }
}
const adminPayload = decodeJwt(ADMIN_TOKEN);
ok(adminPayload?.kind === 'admin', 'admin JWT is kind=admin');
ok(!adminPayload?.password && !adminPayload?.passwordHash, 'admin JWT carries no password material');
ok(typeof adminPayload?.exp === 'number', 'admin JWT has an expiry');
const ttlMin = Math.round((adminPayload.exp - adminPayload.iat) / 60);
ok(ttlMin <= 60, `admin JWT TTL is short (${ttlMin} min)`);

// ─────────────────────────────────────────────────────────────
section('2. Normal-user authentication');

const userLogin = await req('POST', '/auth/login', {
  body: { identifier: '+989120000000', password: 'Demo123!' },
});
ok(userLogin.status === 200, 'demo user login succeeds', `got ${userLogin.status}`);
const USER_TOKEN = userLogin.json?.accessToken;
ok(userLogin.json?.user?.role === 'user', 'demo user has role=user');
ok(!userLogin.json?.adminAccessToken, 'normal user does NOT receive an adminAccessToken');
const userPayload = decodeJwt(USER_TOKEN);
ok(userPayload?.kind === 'user', 'user JWT is kind=user');

const wrongPw = await req('POST', '/auth/login', {
  body: { identifier: '+989120000000', password: 'WrongPassword123' },
});
ok(wrongPw.status === 401, 'wrong password rejected with 401', `got ${wrongPw.status}`);
ok(!/does not exist|no such user|not found/i.test(wrongPw.json?.error?.message ?? ''),
   'failed login does not reveal whether the account exists');

// ─────────────────────────────────────────────────────────────
section('3. Admin authorization on EVERY admin route');

const ADMIN_ROUTES = [
  ['GET', '/admin/games'],
  ['GET', '/admin/users'],
  ['GET', '/admin/packages'],
  ['GET', '/admin/settings'],
  ['GET', '/admin/dashboard'],
  ['GET', '/admin/audit-logs'],
  ['GET', '/admin/categories'],
  ['GET', '/admin/tags'],
  ['GET', '/admin/optimization-categories'],
  ['GET', '/admin/app-versions'],
  ['GET', '/admin/admins'],
  ['GET', '/admin/devices'],
  ['GET', '/admin/subscriptions'],
  ['GET', '/admin/subscriptions/plans'],
  ['GET', '/admin/security/login-attempts'],
  ['GET', '/admin/email/status'],
];

for (const [method, path] of ADMIN_ROUTES) {
  const anon = await req(method, path);
  ok(anon.status === 401 || anon.status === 403, `${path} rejects anonymous`, `got ${anon.status}`);
}

console.log('');
for (const [method, path] of ADMIN_ROUTES) {
  const asUser = await req(method, path, { token: USER_TOKEN });
  ok(asUser.status === 401 || asUser.status === 403, `${path} rejects normal-user token`, `got ${asUser.status}`);
}

console.log('');
for (const [method, path] of ADMIN_ROUTES) {
  const asUserKindAdmin = await req(method, path, { token: ADMIN_USER_TOKEN });
  ok(asUserKindAdmin.status === 401 || asUserKindAdmin.status === 403,
     `${path} rejects admin's *user-kind* token (kind confusion)`, `got ${asUserKindAdmin.status}`);
}

console.log('');
for (const [method, path] of ADMIN_ROUTES) {
  const asAdmin = await req(method, path, { token: ADMIN_TOKEN });
  ok(asAdmin.status === 200, `${path} allows real admin token`, `got ${asAdmin.status}`);
}

// ─────────────────────────────────────────────────────────────
section('4. Admin WRITE routes reject non-admins');

const WRITE_PROBES = [
  ['POST', '/admin/games', { name: 'Hax', slug: 'hax-test' }],
  ['POST', '/admin/categories', { slug: 'hax-cat', name: 'Hax' }],
  ['POST', '/admin/tags', { slug: 'hax-tag', name: 'Hax' }],
  ['POST', '/admin/admins', { email: 'hax@x.com', name: 'Hax', password: 'haxhaxhax', role: 'super_admin' }],
  ['POST', '/admin/app-versions', { version: '9.9.9', downloadUrl: 'https://x.com/a.exe' }],
  ['PUT', '/admin/settings', { settings: { announcement: { enabled: true, text: 'pwned' } } }],
];

for (const [method, path, body] of WRITE_PROBES) {
  const asUser = await req(method, path, { token: USER_TOKEN, body });
  ok(asUser.status === 401 || asUser.status === 403, `${method} ${path} blocks normal user`, `got ${asUser.status}`);
  const anon = await req(method, path, { body });
  ok(anon.status === 401 || anon.status === 403, `${method} ${path} blocks anonymous`, `got ${anon.status}`);
}

// verify no damage was done by the probes
const settingsAfter = await req('GET', '/admin/settings', { token: ADMIN_TOKEN });
ok(settingsAfter.json?.data?.announcement?.enabled !== true,
   'blocked PUT /admin/settings did NOT mutate state');
const adminsAfter = await req('GET', '/admin/admins', { token: ADMIN_TOKEN });
ok(!(adminsAfter.json?.data ?? []).some(a => a.email === 'hax@x.com'),
   'blocked POST /admin/admins did NOT create an admin');

// ─────────────────────────────────────────────────────────────
section('5. Token forgery / tampering');

const forged = ADMIN_TOKEN.slice(0, -6) + 'AAAAAA';
const forgedRes = await req('GET', '/admin/games', { token: forged });
ok(forgedRes.status === 401, 'tampered signature rejected', `got ${forgedRes.status}`);

// alg:none attack
const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
const nonePayload = Buffer.from(JSON.stringify({ sub: adminPayload.sub, kind: 'admin', role: 'super_admin', exp: 9999999999 })).toString('base64url');
const noneToken = `${noneHeader}.${nonePayload}.`;
const noneRes = await req('GET', '/admin/games', { token: noneToken });
ok(noneRes.status === 401, 'alg:none forgery rejected', `got ${noneRes.status}`);

// privilege escalation: take the user token payload, claim admin
const escalHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const escalPayload = Buffer.from(JSON.stringify({ sub: userPayload.sub, kind: 'admin', role: 'super_admin', exp: 9999999999 })).toString('base64url');
const escalRes = await req('GET', '/admin/games', { token: `${escalHeader}.${escalPayload}.fakesig` });
ok(escalRes.status === 401, 'unsigned privilege-escalation payload rejected', `got ${escalRes.status}`);

const garbage = await req('GET', '/admin/games', { token: 'not-a-jwt-at-all' });
ok(garbage.status === 401, 'garbage token rejected', `got ${garbage.status}`);

// ─────────────────────────────────────────────────────────────
section('6. Injection & malformed input');

const sqli = await req('GET', `/admin/users?q=${encodeURIComponent("' OR 1=1--")}`, { token: ADMIN_TOKEN });
ok(sqli.status === 200, 'SQLi probe in admin search returns 200 (parameterized)', `got ${sqli.status}`);
ok(Array.isArray(sqli.json?.data), 'SQLi probe returns a normal array, not a dump');

const sqli2 = await req('GET', `/games?q=${encodeURIComponent("'; DROP TABLE games;--")}`);
ok(sqli2.status === 200, 'SQLi probe in public search handled safely', `got ${sqli2.status}`);
const gamesStillThere = await req('GET', '/games');
ok((gamesStillThere.json?.data?.length ?? 0) > 0, 'games table intact after DROP TABLE probe');

const techInject = await req('GET', `/games?techs=${encodeURIComponent("dlss') OR 1=1--")}`);
ok(techInject.status === 400 || techInject.status === 200,
   'techs param (uses sql.raw internally) rejects/handles injection', `got ${techInject.status}`);
if (techInject.status === 200) {
  ok(Array.isArray(techInject.json?.data), 'techs injection did not break the query');
}

const badJson = await req('POST', '/auth/login', { body: {}, raw: '{"identifier":' });
ok(badJson.status === 400, 'malformed JSON body rejected with 400', `got ${badJson.status}`);

const xss = await req('POST', '/admin/categories', {
  token: ADMIN_TOKEN,
  body: { slug: 'xss-probe-test', name: '<script>alert(1)</script>' },
});
ok(xss.status === 201 || xss.status === 200 || xss.status === 400,
   'XSS-ish name handled (stored or rejected, never executed server-side)', `got ${xss.status}`);
if (xss.json?.id) {
  await req('DELETE', `/admin/categories/${xss.json.id}`, { token: ADMIN_TOKEN });
}

const oversize = await req('POST', '/admin/categories', {
  token: ADMIN_TOKEN,
  body: { slug: 'x'.repeat(5000), name: 'y'.repeat(5000) },
});
ok(oversize.status === 400, 'oversized input rejected by Zod', `got ${oversize.status}`);

// ─────────────────────────────────────────────────────────────
section('7. IDOR / cross-tenant access');

const badUuid = await req('GET', '/admin/games/00000000-0000-0000-0000-000000000000', { token: ADMIN_TOKEN });
ok(badUuid.status === 404, 'nonexistent game id → 404 (no info leak)', `got ${badUuid.status}`);

const notUuid = await req('GET', '/admin/games/..%2F..%2Fetc%2Fpasswd', { token: ADMIN_TOKEN });
ok(notUuid.status === 400 || notUuid.status === 404, 'path-traversal-shaped id rejected', `got ${notUuid.status}`);

const meAsUser = await req('GET', '/auth/me', { token: USER_TOKEN });
ok(meAsUser.status === 200, '/auth/me works for normal user');
ok(meAsUser.json?.role === 'user', '/auth/me returns the caller\'s OWN role, not admin');
ok(!meAsUser.json?.passwordHash, '/auth/me never returns a password hash');

// ─────────────────────────────────────────────────────────────
section('8. Public endpoints do not leak privileged data');

const publicGames = await req('GET', '/games');
ok(publicGames.status === 200, 'public /games works anonymously');
const pubStr = JSON.stringify(publicGames.json);
ok(!/passwordHash|password_hash/i.test(pubStr), 'public games payload has no password material');
ok(!/adminAccessToken/i.test(pubStr), 'public games payload has no admin tokens');

const optSetting = await req('GET', '/optimized-setting/games');
ok(optSetting.status === 200, 'public /optimized-setting/games works anonymously');
ok(Array.isArray(optSetting.json?.data), 'optimized-setting returns a data array');
const optStr = JSON.stringify(optSetting.json);
ok(!/passwordHash|deletedAt/i.test(optStr), 'optimized-setting payload leaks no internal fields');

// draft games must not appear publicly
const adminGamesList = await req('GET', '/admin/games?limit=100', { token: ADMIN_TOKEN });
const draftGame = (adminGamesList.json?.data ?? []).find(g => g.status === 'draft');
if (draftGame) {
  const pubDraft = await req('GET', `/games/${draftGame.slug}`);
  ok(pubDraft.status === 404, 'draft game is NOT served publicly', `got ${pubDraft.status}`);
} else {
  console.log('  \x1b[33m·\x1b[0m no draft game present to test public hiding (skipped)');
}

// ─────────────────────────────────────────────────────────────
section('9. Session / refresh handling');

const refreshNoCookie = await req('POST', '/auth/refresh');
ok(refreshNoCookie.status === 401, 'refresh without cookie → 401', `got ${refreshNoCookie.status}`);

const refreshOk = await req('POST', '/auth/refresh', { cookie: adminCookie });
ok(refreshOk.status === 200, 'refresh with valid cookie → 200', `got ${refreshOk.status}`);
ok(refreshOk.json?.accessToken !== ADMIN_USER_TOKEN, 'refresh rotates the access token');
const rotatedCookie = refreshOk.setCookie.map(c => c.split(';')[0]).join('; ');

// old refresh token must be dead after rotation
const replayOld = await req('POST', '/auth/refresh', { cookie: adminCookie });
ok(replayOld.status === 401, 'OLD refresh token is revoked after rotation (no replay)', `got ${replayOld.status}`);

const meNoToken = await req('GET', '/auth/me');
ok(meNoToken.status === 401, '/auth/me without token → 401', `got ${meNoToken.status}`);

// ─────────────────────────────────────────────────────────────
section('10. Security headers & CORS');

const headRes = await fetch(`${BASE}/games`);
const h = headRes.headers;
ok(!!h.get('x-content-type-options'), `X-Content-Type-Options present (${h.get('x-content-type-options')})`);
ok(!!h.get('x-frame-options') || !!h.get('content-security-policy'), 'clickjacking protection present');
ok(!h.get('x-powered-by'), 'X-Powered-By not disclosed');

const corsEvil = await fetch(`${BASE}/games`, { headers: { Origin: 'https://evil.example.com' } });
const allowOrigin = corsEvil.headers.get('access-control-allow-origin');
ok(allowOrigin !== '*', `CORS does not use wildcard (got ${allowOrigin ?? 'none'})`);
ok(allowOrigin !== 'https://evil.example.com', 'CORS rejects an unlisted evil origin');

// ─────────────────────────────────────────────────────────────
section('11. Signed download protection');

const pkgDirect = await fetch('http://127.0.0.1:4000/uploads/packages/anything.dll');
ok(pkgDirect.status === 403 || pkgDirect.status === 404,
   'package files are not directly downloadable without a signed link', `got ${pkgDirect.status}`);

const traversal = await fetch('http://127.0.0.1:4000/uploads/../../../etc/passwd');
ok(traversal.status >= 400, 'path traversal on /uploads blocked', `got ${traversal.status}`);
const traversal2 = await fetch('http://127.0.0.1:4000/uploads/%2e%2e%2f%2e%2e%2fetc%2fpasswd');
ok(traversal2.status >= 400, 'encoded path traversal on /uploads blocked', `got ${traversal2.status}`);

// ─────────────────────────────────────────────────────────────
section('12. Rate limiting');

const burst = await Promise.all(
  Array.from({ length: 45 }, () => req('POST', '/auth/login', {
    body: { identifier: 'ratelimit-probe@example.com', password: 'nope' },
  })),
);
const got429 = burst.filter(r => r.status === 429).length;
ok(got429 > 0, `login endpoint rate-limits a burst (${got429}/45 got 429)`);
ok(!burst.some(r => r.status >= 500), 'rate limiting never produces a 5xx');

// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`\x1b[1mRESULT: ${pass} passed, ${fail} failed\x1b[0m`);
if (failures.length) {
  console.log('\n\x1b[31mFailures:\x1b[0m');
  for (const f of failures) console.log('  • ' + f);
}
console.log('═'.repeat(60));
process.exit(fail > 0 ? 1 : 0);
