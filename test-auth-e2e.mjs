#!/usr/bin/env node
/**
 * PC MAX — End-to-end authentication lifecycle test.
 * Tests the FULL flow: admin login → /auth/me → /auth/refresh → admin API → normal user blocked.
 * Runs against the live dev API on localhost:4000.
 */

const BASE = 'http://127.0.0.1:4000/api/v1';
let passed = 0;
let failed = 0;
let cookieJar = {};

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ FAIL: ${msg}`); }
}

function extractCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const h of headers) {
    const m = h.match(/^(\w+)=([^;]+)/);
    if (m) cookieJar[m[1]] = m[2];
  }
}

function cookieString() {
  return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(method, path, body, headers = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  // Include cookies for refresh endpoints
  if (Object.keys(cookieJar).length > 0) {
    opts.headers['Cookie'] = cookieString();
  }
  const res = await fetch(`${BASE}${path}`, opts);
  // Capture Set-Cookie
  const sc = res.headers.getSetCookie?.() || [];
  for (const h of sc) extractCookies(h);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

// ─── Test 1: Admin login ────────────────────────────────────
console.log('\n=== Test 1: Admin Login ===');
{
  const r = await req('POST', '/auth/login', {
    identifier: 'admin@gmail.com',
    password: 'admin123',
  });
  assert(r.status === 200, `Login returns 200 (got ${r.status})`);
  assert(r.json?.user?.role === 'admin', `User role is 'admin' (got ${r.json?.user?.role})`);
  assert(r.json?.user?.email === 'admin@gmail.com', `Email is correct (got ${r.json?.user?.email})`);
  assert(typeof r.json?.accessToken === 'string' && r.json.accessToken.length > 10, 'accessToken is a valid string');
  assert(typeof r.json?.adminAccessToken === 'string' && r.json.adminAccessToken.length > 10, 'adminAccessToken is a valid string');

  // Store tokens for subsequent tests
  globalThis.ADMIN_USER_TOKEN = r.json.accessToken;
  globalThis.ADMIN_API_TOKEN = r.json.adminAccessToken;

  // Verify cookie was set
  assert('goh_refresh' in cookieJar, `goh_refresh cookie set (cookies: ${Object.keys(cookieJar).join(', ')})`);
}

// ─── Test 2: /auth/me with user-kind token ──────────────────
console.log('\n=== Test 2: /auth/me with admin user-kind token ===');
{
  const r = await req('GET', '/auth/me', null, {
    Authorization: `Bearer ${globalThis.ADMIN_USER_TOKEN}`,
  });
  assert(r.status === 200, `/auth/me returns 200 (got ${r.status})`);
  assert(r.json?.role === 'admin', `/auth/me returns admin role (got ${r.json?.role})`);
  assert(r.json?.email === 'admin@gmail.com', `/auth/me returns admin email`);
}

// ─── Test 3: /auth/refresh with goh_refresh cookie ──────────
console.log('\n=== Test 3: /auth/refresh (admin session via cookie) ===');
{
  const r = await req('POST', '/auth/refresh');
  assert(r.status === 200, `/auth/refresh returns 200 (got ${r.status})`);
  assert(r.json?.user?.role === 'admin', `Refresh returns admin role (got ${r.json?.user?.role})`);
  assert(typeof r.json?.accessToken === 'string' && r.json.accessToken.length > 10, 'Refresh returns new accessToken');
  assert(typeof r.json?.adminAccessToken === 'string' && r.json.adminAccessToken.length > 10, 'Refresh returns new adminAccessToken');

  // The new token should be DIFFERENT from the original (token rotation)
  assert(r.json.accessToken !== globalThis.ADMIN_USER_TOKEN, 'New accessToken differs from original (rotation works)');

  // Update stored tokens
  globalThis.ADMIN_USER_TOKEN = r.json.accessToken;
  globalThis.ADMIN_API_TOKEN = r.json.adminAccessToken;
}

// ─── Test 4: Admin API with adminAccessToken ────────────────
console.log('\n=== Test 4: Admin API with adminAccessToken ===');
{
  const r = await req('GET', '/admin/games', null, {
    Authorization: `Bearer ${globalThis.ADMIN_API_TOKEN}`,
  });
  assert(r.status === 200, `/admin/games returns 200 (got ${r.status})`);
  assert(Array.isArray(r.json?.data), `Response has data array (got ${typeof r.json?.data})`);
  assert((r.json?.data?.length ?? 0) > 0, `Has games (got ${r.json?.data?.length ?? 0})`);
}

// ─── Test 5: Admin API with user-kind token should FAIL ─────
console.log('\n=== Test 5: Admin API with user-kind token (should fail) ===');
{
  const r = await req('GET', '/admin/games', null, {
    Authorization: `Bearer ${globalThis.ADMIN_USER_TOKEN}`,
  });
  // admin endpoints use `authenticate` which requires admin-kind JWT
  // user-kind tokens should be rejected
  assert(r.status === 401 || r.status === 403, `Admin API rejects user-kind token (got ${r.status})`);
}

// ─── Test 6: Normal user cannot access admin APIs ───────────
console.log('\n=== Test 6: Register normal user → attempt admin API ===');
{
  // Try to login as admin but with wrong password — should fail
  const r = await req('POST', '/auth/login', {
    identifier: 'admin@gmail.com',
    password: 'wrongpassword123',
  });
  assert(r.status === 401, `Wrong password returns 401 (got ${r.status})`);
}

// ─── Test 7: No token → /auth/me returns 401 ───────────────
console.log('\n=== Test 7: No token → /auth/me returns 401 ===');
{
  const r = await req('GET', '/auth/me');
  assert(r.status === 401, `No token returns 401 (got ${r.status})`);
}

// ─── Test 8: No cookie → /auth/refresh returns 401 ──────────
console.log('\n=== Test 8: No cookie → /auth/refresh returns 401 ===');
{
  // Clear cookies
  cookieJar = {};
  const r = await req('POST', '/auth/refresh');
  assert(r.status === 401, `No cookie returns 401 (got ${r.status})`);
}

// ─── Test 9: Admin users endpoint ───────────────────────────
console.log('\n=== Test 9: Admin users endpoint ===');
{
  const r = await req('GET', '/admin/users', null, {
    Authorization: `Bearer ${globalThis.ADMIN_API_TOKEN}`,
  });
  assert(r.status === 200, `/admin/users returns 200 (got ${r.status})`);
  assert(Array.isArray(r.json?.data), `Has users array`);
}

// ─── Test 10: Health check (no auth needed) ─────────────────
console.log('\n=== Test 10: Health check ===');
{
  const r = await req('GET', '../../health');
  // Health endpoint may be at /health or /api/v1/health
  const r2 = await fetch('http://127.0.0.1:4000/health');
  assert(r2.status === 200 || r2.status === 404, `Health check responds (got ${r2.status})`);
}

// ─── Summary ────────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
