#!/usr/bin/env node
/**
 * Register a built installer as the latest app version, so the auto-updater
 * starts offering it.
 *
 *   PCMAX_ADMIN_PASSWORD=… node apps/api/scripts/register-release.mjs \
 *     --exe ~/Downloads/_pm/'PC MAX_0.4.0_x64-setup.exe' \
 *     --sig ~/Downloads/_pm/'PC MAX_0.4.0_x64-setup.exe.sig' \
 *     --url https://github.com/DLSDT/pc-max/releases/download/v0.4.0/PC.MAX_0.4.0_x64-setup.exe \
 *     --base https://pc-maxapp.rixy.ir/api/v1 --admin-email admin@pcmax.rixy.ir --apply
 *
 * The API stores `downloadUrl` verbatim and hands it to Tauri unchanged — it
 * does not host the file. The only upload endpoint takes images under 10 MB,
 * so the installer has to live somewhere else: a GitHub release asset on a
 * public repo, or any URL that serves the exact bytes without authentication.
 *
 * Before writing anything this checks the two things that silently break
 * auto-update if they are wrong:
 *
 *   1. the signature's key id matches the pubkey compiled into the app — a
 *      mismatch means every client rejects the update and nobody finds out,
 *      because the failure is client-side and silent;
 *   2. the URL actually serves the same bytes as the local file.
 *
 * Dry by default. Nothing is written without --apply.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const exePath = arg('exe');
const sigPath = arg('sig');
const downloadUrl = arg('url');
const base = arg('base', 'http://localhost:4000/api/v1').replace(/\/+$/, '');
const adminEmail = arg('admin-email', process.env.PCMAX_ADMIN_EMAIL);
const adminPassword = process.env.PCMAX_ADMIN_PASSWORD;
const notes = arg('notes', '');
const apply = has('apply');
const skipFetch = has('skip-url-check');

if (!exePath || !sigPath || !downloadUrl) {
  console.error('usage: register-release.mjs --exe <file> --sig <file> --url <public URL> [--base URL] [--admin-email EMAIL] [--notes "…"] [--apply]');
  process.exit(2);
}

const exe = await readFile(exePath);
const sig = (await readFile(sigPath, 'utf8')).trim();
const sha256 = createHash('sha256').update(exe).digest('hex');

// Version comes from the installer's own filename, so it cannot drift from
// what was actually built.
const version = /(\d+\.\d+\.\d+)/.exec(exePath)?.[1];
if (!version) throw new Error(`could not read a semver out of ${exePath}`);

console.log(`\nregister ${version} → ${base}${apply ? '' : '  (dry run — nothing is written)'}\n`);
console.log(`  installer : ${(exe.length / 1048576).toFixed(1)} MB`);
console.log(`  sha256    : ${sha256}`);
console.log(`  url       : ${downloadUrl}`);

// --- 1. does this signature belong to the key the app trusts? --------------
const conf = JSON.parse(await readFile(new URL('../../desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const pubText = Buffer.from(conf.plugins.updater.pubkey, 'base64').toString();
const keyIdOf = (armored) => {
  const line = armored.trim().split('\n').find((l) => !l.startsWith('untrusted'));
  return Buffer.from(line, 'base64').subarray(2, 10).toString('hex');
};
const pubKeyId = keyIdOf(pubText);
const sigKeyId = keyIdOf(Buffer.from(sig, 'base64').toString());
if (pubKeyId !== sigKeyId) {
  console.error(`\n  ✗ signature key ${sigKeyId} does not match the app's pubkey ${pubKeyId}`);
  console.error('    Every installed client would reject this update, silently.');
  process.exit(1);
}
console.log(`  key id    : ${pubKeyId} ✓ matches the pubkey compiled into the app`);

// --- 2. does the URL serve these exact bytes? ------------------------------
if (!skipFetch) {
  console.log('  url check : downloading to compare bytes…');
  const res = await fetch(downloadUrl, { redirect: 'follow' });
  if (!res.ok) {
    console.error(`  ✗ ${downloadUrl} returned ${res.status}. The updater fetches this URL anonymously.`);
    process.exit(1);
  }

  // Size first: it is free, and a mismatch here is already conclusive, so a
  // wrong URL fails in a second instead of after a full download.
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared && declared !== exe.length) {
    console.error(`  ✗ the URL serves ${declared} bytes, the local installer is ${exe.length}`);
    process.exit(1);
  }

  // Streamed with progress. This is a multi-megabyte fetch over whatever line
  // the operator happens to have — measured at ~85 KB/s here, so roughly two
  // minutes — and a silent process for that long is indistinguishable from a
  // hung one, which is exactly how it first got reported.
  const hash = createHash('sha256');
  let got = 0;
  for await (const chunk of res.body) {
    hash.update(chunk);
    got += chunk.length;
    if (process.stdout.isTTY) process.stdout.write(`\r              ${(got / 1048576).toFixed(1)}/${(exe.length / 1048576).toFixed(1)} MB   `);
  }
  if (process.stdout.isTTY) process.stdout.write('\r                                        \r');

  const remoteSha = hash.digest('hex');
  if (remoteSha !== sha256) {
    console.error(`  ✗ the URL serves different bytes (${remoteSha.slice(0, 16)}… vs ${sha256.slice(0, 16)}…)`);
    process.exit(1);
  }
  console.log('  url check : same bytes as the local file ✓');
}

if (!apply) {
  console.log('\n  dry run — re-run with --apply to register.\n');
  process.exit(0);
}

if (!adminEmail || !adminPassword) {
  console.error('\n  admin credentials required to write: --admin-email plus PCMAX_ADMIN_PASSWORD');
  process.exit(2);
}

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(globalThis.__tok ? { authorization: `Bearer ${globalThis.__tok}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const login = await api('POST', '/admin/auth/login', { email: adminEmail, password: adminPassword });
globalThis.__tok = login?.accessToken ?? login?.data?.accessToken;
if (!globalThis.__tok) throw new Error('login returned no access token');

const existing = (await api('GET', '/admin/app-versions'))?.data ?? [];
if (existing.some((v) => v.version === version && v.platform === 'windows')) {
  console.log(`\n  ${version} is already registered for windows — nothing to do.\n`);
  process.exit(0);
}

await api('POST', '/admin/app-versions', {
  version,
  platform: 'windows',
  channel: 'stable',
  downloadUrl,
  checksumSha256: sha256,
  signature: sig,
  ...(notes ? { releaseNotes: notes } : {}),
});
console.log('  registered');

// --- 3. prove the updater now offers it ------------------------------------
// `latest` is the whole row, not a version string — interpolating it directly
// printed "[object Object]" and told the operator nothing.
const ver = await api('GET', '/app/version');
console.log(`\n  /app/version → latest=${ver?.latest?.version ?? 'null'}`);

const res = await fetch(`${base}/updates/windows/x86_64/0.0.1`);
if (res.status === 200) {
  const body = await res.json();
  console.log(`  /updates → 200, offering ${body.version}`);
  console.log(`     url=${body.url}`);
  console.log(`     signature=${body.signature ? 'present' : 'MISSING'}`);
} else {
  console.log(`  /updates → ${res.status} (expected 200 offering ${version})`);
}
console.log('');
