#!/usr/bin/env node
/**
 * Fill in game descriptions, in both languages, from a file.
 *
 *   PCMAX_ADMIN_PASSWORD=… node apps/api/scripts/apply-game-descriptions.mjs \
 *     --file apps/api/content/game-descriptions.json \
 *     --base https://pc-maxapp.rixy.ir/api/v1 \
 *     --admin-email admin@pcmax.rixy.ir --apply
 *
 * The file is `{ "<slug>": { "en": "…", "fa": "…" } }`. Either language may be
 * missing: the app shows whichever the reader's locale asks for and falls back
 * to the other, so a game with only English text is a normal state and not a
 * half-finished one.
 *
 * Writing prose into 313 rows is not something to do blind, so this is dry by
 * default and reports exactly which games it would touch, which it would skip
 * for already having text, and which slugs in the file match no game — that
 * last one is how a typo is caught before it becomes a silent no-op.
 *
 * `--overwrite` is required to replace a description that already exists.
 * Without it, text someone wrote by hand in the admin panel survives a re-run.
 */
import { readFile } from 'node:fs/promises';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const base = arg('base', 'http://localhost:4000/api/v1').replace(/\/+$/, '');
const adminEmail = arg('admin-email', process.env.PCMAX_ADMIN_EMAIL);
const adminPassword = process.env.PCMAX_ADMIN_PASSWORD;
const file = arg('file');
const apply = has('apply');
const overwrite = has('overwrite');

if (!file) {
  console.error('usage: apply-game-descriptions.mjs --file <descriptions.json>');
  console.error('       [--base URL] [--admin-email EMAIL] [--overwrite] [--apply]');
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

const wanted = JSON.parse(await readFile(file, 'utf8'));
const slugs = Object.keys(wanted);
if (slugs.length === 0) {
  console.error(`${file} has no entries`);
  process.exit(2);
}

const login = await api('POST', '/admin/auth/login', { email: adminEmail, password: adminPassword });
token = login?.accessToken ?? login?.data?.accessToken;
if (!token) throw new Error('login returned no access token');

// The admin list pages; pulling every page beats guessing a limit that the
// server may cap lower than asked.
const games = [];
for (let page = 1; page < 50; page += 1) {
  const res = await api('GET', `/admin/games?page=${page}&limit=100`);
  const batch = res?.data ?? [];
  if (batch.length === 0) break;
  games.push(...batch);
  if (batch.length < 100) break;
}
const bySlug = new Map(games.map((g) => [g.slug, g]));

console.log(`\n${slugs.length} description(s) → ${base}${apply ? '' : '  (dry run — nothing is written)'}\n`);

const missing = slugs.filter((s) => !bySlug.has(s));
const planned = [];
const skipped = [];

for (const slug of slugs) {
  const game = bySlug.get(slug);
  if (!game) continue;
  const entry = wanted[slug] ?? {};
  const patch = {};
  // A description already there was either written by hand or applied earlier;
  // either way it is not this file's to replace unless asked.
  if (entry.en && (overwrite || !game.descriptionEn)) patch.descriptionEn = entry.en;
  if (entry.fa && (overwrite || !game.descriptionFa)) patch.descriptionFa = entry.fa;
  if (Object.keys(patch).length === 0) skipped.push(slug);
  else planned.push({ slug, id: game.id, name: game.name, patch });
}

for (const p of planned) {
  const langs = Object.keys(p.patch).map((k) => (k === 'descriptionFa' ? 'fa' : 'en')).join('+');
  console.log(`  ${p.slug.padEnd(42)} ${langs}`);
}
if (skipped.length) console.log(`\n  ${skipped.length} already had text (use --overwrite to replace)`);
if (missing.length) {
  console.log(`\n  ${missing.length} slug(s) match no game — check for a typo:`);
  for (const s of missing.slice(0, 20)) console.log(`    ${s}`);
}

if (!apply) {
  console.log(`\n  dry run — re-run with --apply to write ${planned.length} description(s).\n`);
  process.exit(0);
}

let done = 0;
for (const p of planned) {
  try {
    await api('PATCH', `/admin/games/${p.id}`, p.patch);
    done += 1;
  } catch (err) {
    // Keep going: one bad row should not strand the other three hundred.
    console.error(`  ✗ ${p.slug}: ${err.message}`);
  }
}
console.log(`\n  ✓ ${done}/${planned.length} written.\n`);
