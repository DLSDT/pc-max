/**
 * Black-box end-to-end harness for the PC MAX API.
 *
 * Talks to a running deployment over HTTP only — no imports from the API
 * source, no database handle. That is the point: it exercises the same path a
 * desktop client takes, through Nginx and TLS when pointed at the public
 * domain, so it catches the class of failure unit tests cannot see (a bad
 * reverse-proxy header, a CORS origin that no longer matches, a migration that
 * did not run, an image built from the wrong commit).
 *
 * Two modes, because the same suite runs against a throwaway stack and against
 * the live server:
 *
 *   full      every test, including ones that create and delete rows.
 *             Only ever point this at a local/staging deployment.
 *   readonly  skips anything that mutates state. Safe against production;
 *             this is the default, so a mistyped --base cannot write.
 *
 * A test declares `mode: 'full'` to opt into the destructive set. Anything
 * without that runs everywhere, so the default is the safe one.
 */

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

export class Ctx {
  constructor({ base, mode, adminEmail, adminPassword, timeoutMs = 20000 }) {
    this.base = base.replace(/\/+$/, '');
    this.mode = mode;
    this.adminEmail = adminEmail;
    this.adminPassword = adminPassword;
    this.timeoutMs = timeoutMs;
    this.cookies = new Map();
    this._adminToken = null;
    /** Ids created during a run, so `full` mode can clean up after itself. */
    this.created = [];
    /** Facts one suite discovers that another can reuse (e.g. a real slug). */
    this.shared = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  _absorbCookies(res) {
    // Node exposes multiple Set-Cookie headers through getSetCookie(); the
    // plain .get() concatenates them with commas and mangles Expires dates.
    const raw = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
    for (const line of raw) {
      const m = /^([^=]+)=([^;]*)/.exec(line);
      if (!m) continue;
      const [, name, value] = m;
      // An empty value with Max-Age=0 is a deletion, not a cookie worth keeping.
      if (value === '' || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /**
   * One HTTP call. Never throws on a non-2xx — the status is the assertion
   * material. Only a transport failure or timeout rejects.
   */
  async req(method, path, opts = {}) {
    const { body, headers = {}, token, noCookies = false, signalTimeoutMs } = opts;
    const url = path.startsWith('http') ? path : `${this.base}${path}`;
    const h = { accept: 'application/json', ...headers };
    if (body !== undefined && !h['content-type'] && !h['Content-Type']) {
      h['content-type'] = 'application/json';
    }
    if (token) h.authorization = `Bearer ${token}`;
    if (!noCookies && this.cookies.size) h.cookie = this.cookieHeader();

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), signalTimeoutMs ?? this.timeoutMs);
    const started = Date.now();
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: h,
        body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
        redirect: 'manual',
        signal: ac.signal,
      });
    } finally {
      clearTimeout(t);
    }
    const ms = Date.now() - started;
    this._absorbCookies(res);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON — fine */ }
    return { status: res.status, headers: res.headers, json, text, ms, url };
  }

  /** Whether admin-authenticated tests can run at all. */
  hasAdminCreds() {
    return Boolean(this.adminEmail && this.adminPassword);
  }

  /** Cached admin access token. Throws with the server's message if login fails. */
  async adminToken() {
    if (this._adminToken) return this._adminToken;
    if (!this.hasAdminCreds()) {
      throw new Error('admin credentials not provided (--admin-email / PCMAX_ADMIN_PASSWORD)');
    }
    const r = await this.req('POST', '/admin/auth/login', {
      body: { email: this.adminEmail, password: this.adminPassword },
    });
    if (r.status !== 200) {
      throw new Error(`admin login failed: ${r.status} ${r.text.slice(0, 200)}`);
    }
    const tok = r.json?.data?.accessToken ?? r.json?.accessToken ?? r.json?.data?.token;
    if (!tok) throw new Error(`admin login returned no token: ${r.text.slice(0, 200)}`);
    this._adminToken = tok;
    return tok;
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function oneOf(actual, allowed, msg) {
  if (!allowed.includes(actual)) {
    throw new Error(`${msg} — expected one of ${JSON.stringify(allowed)}, got ${JSON.stringify(actual)}`);
  }
}

/** Runs the suites and prints a report. Returns the number of failures. */
export async function runSuites(suites, ctx, { filter } = {}) {
  const results = [];
  let pass = 0, fail = 0, skip = 0;

  for (const suite of suites) {
    if (filter && !suite.name.includes(filter)) continue;
    process.stdout.write(`\n${BOLD}▸ ${suite.name}${RESET}\n`);
    for (const test of suite.tests) {
      if (test.mode === 'full' && ctx.mode !== 'full') {
        skip++;
        results.push({ suite: suite.name, test: test.name, state: 'skip' });
        process.stdout.write(`  ${DIM}○ ${test.name} ${YELLOW}(skipped: mutates state)${RESET}\n`);
        continue;
      }
      // A missing password is a setup gap, not a broken API. Reporting it as a
      // failure per test buries the one real failure under a wall of identical
      // ones — which is exactly what it did the first time this ran.
      if (test.admin && !ctx.hasAdminCreds()) {
        skip++;
        results.push({ suite: suite.name, test: test.name, state: 'skip' });
        process.stdout.write(`  ${DIM}○ ${test.name} ${YELLOW}(skipped: no admin credentials)${RESET}\n`);
        continue;
      }
      const started = Date.now();
      try {
        await test.run(ctx);
        const ms = Date.now() - started;
        pass++;
        results.push({ suite: suite.name, test: test.name, state: 'pass', ms });
        process.stdout.write(`  ${GREEN}✓${RESET} ${test.name} ${DIM}${ms}ms${RESET}\n`);
      } catch (err) {
        const ms = Date.now() - started;
        fail++;
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ suite: suite.name, test: test.name, state: 'fail', ms, error: msg });
        process.stdout.write(`  ${RED}✗ ${test.name}${RESET} ${DIM}${ms}ms${RESET}\n`);
        process.stdout.write(`    ${RED}${msg}${RESET}\n`);
      }
    }
  }

  process.stdout.write(`\n${BOLD}${'─'.repeat(56)}${RESET}\n`);
  process.stdout.write(`  ${GREEN}${pass} passed${RESET}`);
  if (fail) process.stdout.write(`   ${RED}${fail} failed${RESET}`);
  if (skip) process.stdout.write(`   ${YELLOW}${skip} skipped${RESET}`);
  process.stdout.write(`\n  ${DIM}${ctx.base}  (${ctx.mode} mode)${RESET}\n\n`);

  if (fail) {
    process.stdout.write(`${BOLD}Failures${RESET}\n`);
    for (const r of results.filter((x) => x.state === 'fail')) {
      process.stdout.write(`  ${RED}✗${RESET} ${r.suite} › ${r.test}\n    ${DIM}${r.error}${RESET}\n`);
    }
    process.stdout.write('\n');
  }
  return fail;
}
