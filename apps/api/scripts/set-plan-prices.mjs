#!/usr/bin/env node
/**
 * Set subscription plan prices — for putting the catalogue into a cheap state
 * while a real gateway is being tested end to end.
 *
 *   PCMAX_ADMIN_PASSWORD=… node apps/api/scripts/set-plan-prices.mjs \
 *     --toman 1000 --base https://pc-maxapp.rixy.ir/api/v1 \
 *     --admin-email admin@pcmax.rixy.ir --apply
 *
 * Prices are stored and charged in **Rial**: the plan carries `currency: IRR`,
 * the desktop screen prints that number with the currency code beside it, and
 * the gateway is handed the same figure. Toman is what people actually say, so
 * this takes toman and multiplies by ten — passing 1000 here means the app
 * shows "10,000 IRR" and the gateway charges 1000 toman, which is the same
 * amount said two ways.
 *
 * `--restore <file>` puts back a snapshot written by an earlier run, so a
 * test price is not a one-way door.
 *
 * Dry by default. Nothing is written without --apply.
 */
import { readFile, writeFile } from 'node:fs/promises';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const base = arg('base', 'http://localhost:4000/api/v1').replace(/\/+$/, '');
const adminEmail = arg('admin-email', process.env.PCMAX_ADMIN_EMAIL);
const adminPassword = process.env.PCMAX_ADMIN_PASSWORD;
const toman = arg('toman');
const restorePath = arg('restore');
const apply = has('apply');

if (!toman && !restorePath) {
  console.error('usage: set-plan-prices.mjs --toman <n> | --restore <file.json>');
  console.error('       [--base URL] [--admin-email EMAIL] [--apply]');
  process.exit(2);
}
if (toman && !/^\d+$/.test(toman)) {
  console.error(`--toman must be a whole number of toman, got ${toman}`);
  process.exit(2);
}
if (!adminEmail || !adminPassword) {
  console.error('admin credentials required: --admin-email plus PCMAX_ADMIN_PASSWORD');
  process.exit(2);
}

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

const plans = (await api('GET', '/admin/subscriptions/plans'))?.data ?? [];
if (!plans.length) throw new Error('no subscription plans found');

/** slug -> price, from a snapshot file. */
let wanted;
if (restorePath) {
  const snap = JSON.parse(await readFile(restorePath, 'utf8'));
  wanted = new Map(Object.entries(snap.prices ?? {}));
  console.log(`\nrestore from ${restorePath} → ${base}${apply ? '' : '  (dry run)'}\n`);
} else {
  const rial = Number(toman) * 10;
  wanted = new Map(plans.map((p) => [p.slug, rial]));
  console.log(`\nset every plan to ${Number(toman).toLocaleString('en-US')} toman `
    + `(${rial.toLocaleString('en-US')} IRR) → ${base}${apply ? '' : '  (dry run)'}\n`);
}

const changes = [];
for (const p of plans) {
  const next = wanted.get(p.slug);
  if (next === undefined) { console.log(`  ${p.slug.padEnd(11)} not in the snapshot — left alone`); continue; }
  if (next === p.price) { console.log(`  ${p.slug.padEnd(11)} already ${p.price.toLocaleString('en-US')} IRR`); continue; }
  changes.push({ plan: p, next });
  console.log(`  ${p.slug.padEnd(11)} ${p.price.toLocaleString('en-US')} → ${Number(next).toLocaleString('en-US')} IRR`);
}

if (!changes.length) { console.log('\n  nothing to change.\n'); process.exit(0); }

if (!apply) {
  console.log('\n  dry run — re-run with --apply to write.\n');
  process.exit(0);
}

// Snapshot before writing, so the real prices are recoverable. Skipped on a
// restore, which would otherwise overwrite the very file being restored from.
if (!restorePath) {
  const snap = { takenAt: new Date().toISOString(), base, prices: Object.fromEntries(plans.map((p) => [p.slug, p.price])) };
  const out = `plan-prices-backup.json`;
  await writeFile(out, `${JSON.stringify(snap, null, 2)}\n`);
  console.log(`\n  previous prices saved to ${out}`);
  console.log(`  restore with: --restore ${out} --apply`);
}

for (const { plan, next } of changes) {
  await api('PATCH', `/admin/subscriptions/plans/${plan.id}`, { price: Number(next) });
  console.log(`  ✓ ${plan.slug} → ${Number(next).toLocaleString('en-US')} IRR`);
}

const after = (await api('GET', '/admin/subscriptions/plans'))?.data ?? [];
console.log('\n  now:');
for (const p of after) console.log(`    ${p.slug.padEnd(11)} ${p.price.toLocaleString('en-US')} ${p.currency}`);
console.log('');
