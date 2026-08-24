/**
 * Refuse to produce a production bundle that points at a developer's machine.
 *
 * Vite inlines `import.meta.env.VITE_API_URL` as a string literal, so a stale
 * `.env.local` silently becomes the API address of the shipped installer. That
 * has already happened once: a leftover override from a debugging session
 * produced a build whose only symptom was "Unable to reach the PC MAX service"
 * on every login. The value cannot be validated from inside the app — by the
 * time it runs, the wrong string is already compiled in — so it is checked
 * here, before the build.
 *
 * Runs on `npm run build` in apps/desktop. Dev servers are unaffected.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i;

/** Env wins over the file, matching Vite's own precedence. */
function resolveApiUrl() {
  if (process.env.VITE_API_URL) return { url: process.env.VITE_API_URL.trim(), from: 'the VITE_API_URL environment variable' };
  for (const name of ['.env.local', '.env.production.local', '.env.production', '.env']) {
    const file = join(here, '..', name);
    if (!existsSync(file)) continue;
    const line = readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('VITE_API_URL='));
    if (line) return { url: line.slice('VITE_API_URL='.length).trim(), from: `apps/desktop/${name}` };
  }
  return { url: '', from: '' };
}

const { url, from } = resolveApiUrl();
if (url && LOCAL.test(url)) {
  process.stderr.write(
    `\n  Refusing to build: VITE_API_URL is ${url}\n` +
      `  Set in: ${from}\n\n` +
      `  A production build with a localhost API produces an installer that can only\n` +
      `  report "Unable to reach the PC MAX service" on the user's machine.\n\n` +
      `  Fix: remove that file (or unset the variable), or set it to the real API.\n\n`,
  );
  process.exit(1);
}
