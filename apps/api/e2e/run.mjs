#!/usr/bin/env node
/**
 * PC MAX — end-to-end suite runner.
 *
 *   # against the live server (read-only, safe)
 *   node apps/api/e2e/run.mjs --base https://pc-maxapp.rixy.ir/api/v1
 *
 *   # against a local stack, including the tests that write
 *   node apps/api/e2e/run.mjs --base http://localhost:4000/api/v1 --mode full
 *
 * Admin-authenticated checks need credentials. Pass the email on the command
 * line and the password through the environment, so it never lands in shell
 * history or `ps`:
 *
 *   PCMAX_ADMIN_PASSWORD=… node apps/api/e2e/run.mjs --admin-email admin@…
 *
 * Exits non-zero if anything failed, so it can gate a deploy.
 */
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Ctx, runSuites } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const base = arg('base', 'http://localhost:4000/api/v1');
// Default to readonly: a mistyped --base must never write to the live server.
const mode = arg('mode', 'readonly');
const filter = arg('only', null);
const adminEmail = arg('admin-email', process.env.PCMAX_ADMIN_EMAIL);
const adminPassword = process.env.PCMAX_ADMIN_PASSWORD;

if (!['full', 'readonly'].includes(mode)) {
  console.error(`--mode must be "full" or "readonly", got "${mode}"`);
  process.exit(2);
}
if (mode === 'full' && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(base)) {
  console.error(`refusing to run full (writing) mode against a non-local base: ${base}`);
  console.error('full mode creates and deletes rows — point it at a local stack.');
  process.exit(2);
}

const files = (await readdir(join(here, 'suites')))
  .filter((f) => f.endsWith('.mjs'))
  .sort();

const suites = [];
for (const f of files) {
  const mod = await import(join(here, 'suites', f));
  if (!mod.name || !Array.isArray(mod.tests)) {
    console.error(`suite ${f} must export { name, tests[] } — skipping`);
    continue;
  }
  suites.push({ name: mod.name, tests: mod.tests });
}

const ctx = new Ctx({ base, mode, adminEmail, adminPassword });
console.log(`\nPC MAX e2e — ${suites.length} suites, ${suites.reduce((n, s) => n + s.tests.length, 0)} tests`);
console.log(`target: ${base}  mode: ${mode}`);
if (!ctx.hasAdminCreds()) {
  const missing = adminEmail ? 'PCMAX_ADMIN_PASSWORD is not set' : '--admin-email was not passed';
  console.log(`\n⚠  ${missing} — admin-authenticated tests will be skipped.`);
  console.log('   PCMAX_ADMIN_PASSWORD=… node apps/api/e2e/run.mjs --admin-email …');
}

const failures = await runSuites(suites, ctx, { filter });
process.exit(failures ? 1 : 0);
