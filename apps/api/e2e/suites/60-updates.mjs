import { assert, eq, oneOf } from '../harness.mjs';

export const name = 'updates';

/** The three tools the desktop app offers on its tool pages (the MfgTool enum). */
const TOOLS = ['optiflow', 'optiscaler', 'streamline'];

export const tests = [
  {
    name: 'the updater endpoint answers in the shape Tauri expects',
    run: async (ctx) => {
      // Tauri's updater accepts exactly two things: 204 (you are current) or
      // 200 with {version,url,signature,pub_date}. Anything else — a 404, an
      // error envelope, a partial body — silently disables auto-update for
      // every installed client, and nobody finds out until a release stalls.
      const r = await ctx.req('GET', '/updates/windows/x86_64/0.1.0');
      oneOf(r.status, [200, 204], 'updater status must be 200 or 204');
      if (r.status === 200) {
        const b = r.json;
        assert(b, 'a 200 from the updater must carry a JSON body');
        for (const k of ['version', 'url', 'signature']) {
          assert(typeof b[k] === 'string' && b[k].length > 0, `updater body.${k} must be a non-empty string`);
        }
        assert(/^https:\/\//.test(b.url), `updater url must be https, got ${b.url}`);
        assert(/^\d+\.\d+\.\d+/.test(b.version), `updater version must be semver, got ${b.version}`);
      }
    },
  },
  {
    name: 'a client already on the newest version is told so',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/updates/windows/x86_64/99.0.0');
      // A future version must never be offered a "downgrade".
      eq(r.status, 204, 'a client ahead of the catalog must get 204 No Content');
    },
  },
  {
    name: 'the updater rejects an unknown target/arch cleanly',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/updates/solaris/sparc/0.1.0');
      assert(r.status < 500, `unknown target returned ${r.status} — must not be a 5xx`);
    },
  },
  {
    name: 'a malformed current version does not crash the updater',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/updates/windows/x86_64/not-a-version');
      assert(r.status < 500, `malformed version returned ${r.status} — must not be a 5xx`);
    },
  },
  {
    name: 'GET /app/version is consistent with the updater',
    run: async (ctx) => {
      const [ver, upd] = await Promise.all([
        ctx.req('GET', '/app/version'),
        ctx.req('GET', '/updates/windows/x86_64/0.0.1'),
      ]);
      eq(ver.status, 200, 'app/version status');
      // If no release is registered, both must agree that there is nothing to
      // offer — the two must never disagree, or the in-app banner and the
      // silent updater tell the user different things.
      if (ver.json.latest === null) {
        eq(ver.json.updateAvailable, false, 'updateAvailable must be false when latest is null');
        eq(upd.status, 204, 'updater must return 204 when no release is registered');
      }
    },
  },
  {
    name: 'each MFG tool resolves to a downloadable package',
    run: async (ctx) => {
      const missing = [];
      for (const tool of TOOLS) {
        const r = await ctx.req('GET', `/mfg/tools/${tool}`);
        if (r.status !== 200) { missing.push(`${tool} -> ${r.status}`); continue; }
        if (r.json?.available !== true) { missing.push(`${tool} -> available=${r.json?.available}`); continue; }
        const pkg = r.json?.package;
        if (!pkg?.slug) { missing.push(`${tool} -> no package`); continue; }
        if (pkg.status !== 'published') missing.push(`${tool} -> package status ${pkg.status}`);
      }
      eq(missing.length, 0, `MFG tools not downloadable: ${missing.join(', ')}`);
    },
  },
  {
    name: 'an unknown MFG tool is refused, not invented',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/mfg/tools/not-a-real-tool');
      assert(r.status !== 200 || r.json?.available === false,
        'an unknown tool must not report itself available');
      assert(r.status < 500, `unknown tool returned ${r.status}`);
    },
  },
  {
    name: 'MFG tool download requires authentication',
    run: async (ctx) => {
      for (const tool of TOOLS) {
        const r = await ctx.req('POST', `/mfg/tools/${tool}/download`, { body: {}, noCookies: true });
        eq(r.status, 401, `${tool} download must require auth`);
      }
    },
  },
  {
    name: 'game package listing is well-formed',
    run: async (ctx) => {
      const games = await ctx.req('GET', '/games?limit=10');
      let sawAny = false;
      for (const g of games.json.data) {
        const r = await ctx.req('GET', `/games/${g.slug}/packages`);
        eq(r.status, 200, `packages status for ${g.slug}`);
        const list = r.json?.data ?? r.json;
        assert(Array.isArray(list), `packages for ${g.slug} must be an array`);
        for (const p of list) {
          sawAny = true;
          assert(typeof p.slug === 'string', `package in ${g.slug} needs a slug`);
          eq(p.status, 'published', `package ${p.slug} on a public route must be published`);
        }
      }
      // Not a failure if this database has no per-game packages — the shape is
      // what is under test.
      if (!sawAny) ctx.shared.set('noGamePackages', true);
    },
  },
  {
    name: 'package download requires authentication',
    run: async (ctx) => {
      const games = await ctx.req('GET', '/games?limit=10');
      for (const g of games.json.data) {
        const r = await ctx.req('GET', `/games/${g.slug}/packages`);
        const list = r.json?.data ?? r.json ?? [];
        if (!list.length) continue;
        const d = await ctx.req('POST', `/games/${g.slug}/packages/${list[0].slug}/download`, { body: {}, noCookies: true });
        eq(d.status, 401, 'anonymous package download must be refused');
        return;
      }
    },
  },
];
