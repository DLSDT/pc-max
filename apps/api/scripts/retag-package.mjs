#!/usr/bin/env node
/**
 * Re-file a package's existing files under the right component and variant,
 * without uploading anything.
 *
 *   PCMAX_ADMIN_PASSWORD=… node apps/api/scripts/retag-package.mjs \
 *     --rules apps/api/scripts/packages/optiflow-retag.json \
 *     --base https://pc-maxapp.rixy.ir/api/v1 \
 *     --admin-email admin@pcmax.rixy.ir --apply
 *
 * Each tool page reads its pickers from a `component`, and the choices inside
 * a picker are the distinct `variant` values. A file with the wrong component
 * — or with no variant — is invisible to the page: no error, no log, just an
 * empty list. `optiflow` is in exactly that state, holding all 18 correct
 * files with `component: installer` and `variant: null` while the page asks
 * for `unlocker` and `streamline`.
 *
 * The API has no endpoint to edit a file row, so the fix is to re-create it.
 * The bytes never move: `files/complete` accepts any `storageKey`, and
 * deleting a row leaves the stored object alone, so a row can be re-registered
 * against the object it already points at. For optiflow that turns a 111 MB
 * re-upload — 25 minutes on a 72 KB/s line — into a few hundred bytes of JSON.
 *
 * Dry by default. Nothing is written without --apply.
 */
import { readFile } from 'node:fs/promises';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const rulesPath = arg('rules');
const base = arg('base', 'http://localhost:4000/api/v1').replace(/\/+$/, '');
const adminEmail = arg('admin-email', process.env.PCMAX_ADMIN_EMAIL);
const adminPassword = process.env.PCMAX_ADMIN_PASSWORD;
const apply = has('apply');

if (!rulesPath) {
  console.error('usage: retag-package.mjs --rules <file.json> [--base URL] [--admin-email EMAIL] [--apply]');
  process.exit(2);
}
if (!adminEmail || !adminPassword) {
  console.error('admin credentials required: --admin-email plus PCMAX_ADMIN_PASSWORD in the environment');
  process.exit(2);
}

const spec = JSON.parse(await readFile(rulesPath, 'utf8'));
if (!spec.slug || !Array.isArray(spec.rules)) throw new Error('rules file needs { slug, rules[] }');

let token = null;

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const login = await api('POST', '/admin/auth/login', { email: adminEmail, password: adminPassword });
token = login?.accessToken ?? login?.data?.accessToken;
if (!token) throw new Error('login returned no access token');

// Find the package by slug, paging because the limit is capped at 100.
let pkg = null;
for (let page = 1; !pkg; page++) {
  const list = await api('GET', `/admin/packages?limit=100&page=${page}`);
  const rows = list?.data ?? [];
  pkg = rows.find((p) => p.slug === spec.slug) ?? null;
  if (!pkg && rows.length < 100) break;
}
if (!pkg) throw new Error(`no package with slug ${spec.slug}`);

const files = (await api('GET', `/admin/packages/${pkg.id}/files`))?.data ?? [];
console.log(`\nretag ${spec.slug} → ${base}${apply ? '' : '  (dry run — nothing is written)'}\n`);
console.log(`  package ${pkg.id} (${pkg.status}), ${files.length} file(s)\n`);

/** First rule whose `match` accepts the filename wins. */
function ruleFor(filename) {
  return spec.rules.find((r) =>
    (r.files && r.files.includes(filename))
    || (r.pattern && new RegExp(r.pattern).test(filename)));
}

const planned = [];
const unmatched = [];
for (const f of files) {
  const rule = ruleFor(f.filename);
  if (!rule) { unmatched.push(f); continue; }
  const wantComponent = rule.component;
  const wantVariant = rule.variant ?? null;
  const wantRole = rule.role ?? f.role;
  if (f.component === wantComponent && (f.variant ?? null) === wantVariant && f.role === wantRole) continue;
  planned.push({ file: f, wantComponent, wantVariant, wantRole });
}

if (!planned.length) {
  console.log('  everything already matches the rules — nothing to do.\n');
  process.exit(0);
}

for (const p of planned) {
  console.log(`  ${p.file.filename}`);
  console.log(`      component ${p.file.component} → ${p.wantComponent}`
    + `   variant ${p.file.variant ?? 'null'} → ${p.wantVariant ?? 'null'}`
    + (p.file.role !== p.wantRole ? `   role ${p.file.role} → ${p.wantRole}` : ''));
}
if (unmatched.length) {
  console.log(`\n  ${unmatched.length} file(s) matched no rule and are left alone:`);
  for (const f of unmatched) console.log(`      ${f.filename} (component=${f.component})`);
}

if (!apply) {
  console.log('\n  dry run — re-run with --apply to write.\n');
  process.exit(0);
}

// Re-create first, then delete the old row. In that order a crash in between
// leaves a duplicate, which is visible and fixable; the other order would lose
// the row entirely and, with it, the only record of which object it pointed at.
let done = 0;
for (const p of planned) {
  const f = p.file;
  await api('POST', `/admin/packages/${pkg.id}/files/complete`, {
    storageKey: f.storageKey,
    filename: f.filename,
    size: f.size,
    destination: f.destination,
    operation: f.operation,
    role: p.wantRole,
    component: p.wantComponent,
    ...(p.wantVariant ? { variant: p.wantVariant } : {}),
  });
  await api('DELETE', `/admin/packages/${pkg.id}/files/${f.id}`);
  done++;
  console.log(`  ✓ ${f.filename} → ${p.wantComponent}/${p.wantVariant ?? '(no variant)'}`);
}

if (spec.publish !== false) {
  await api('POST', `/admin/packages/${pkg.id}/publish`, { changeNote: spec.changeNote ?? 'Re-filed components via retag-package' });
  console.log('  published');
}
console.log(`\n  ${done} file(s) re-filed, 0 bytes uploaded\n`);
