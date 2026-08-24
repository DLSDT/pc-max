#!/usr/bin/env node
/**
 * Push an optimization package from a folder on disk into a deployment.
 *
 *   PCMAX_ADMIN_PASSWORD=… node apps/api/scripts/push-package.mjs \
 *     --manifest apps/api/scripts/packages/streamline-pc-max.json \
 *     --base https://pc-maxapp.rixy.ir/api/v1 \
 *     --admin-email admin@pcmax.rixy.ir
 *
 * Why this exists: the desktop app's tool pages are driven entirely by what the
 * server has published. A package that exists in one deployment's database but
 * whose bytes were never uploaded to another leaves that page dead — the app is
 * working correctly and showing you an empty list, which looks like a bug in
 * the app and is not. Re-entering nineteen files with their per-file variant,
 * role, component and destination through the admin UI is slow and easy to get
 * subtly wrong, so this does it from a manifest instead.
 *
 * Safe to re-run. A package with the manifest's slug is reused rather than
 * duplicated, and a file already present with the same name under the same
 * variant is skipped, so an upload interrupted halfway can simply be run again.
 *
 * --dry-run prints exactly what would be sent and touches nothing.
 */
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const manifestPath = arg('manifest');
const base = (arg('base', 'http://localhost:4000/api/v1')).replace(/\/+$/, '');
const adminEmail = arg('admin-email', process.env.PCMAX_ADMIN_EMAIL);
const adminPassword = process.env.PCMAX_ADMIN_PASSWORD;
const dryRun = has('dry-run');
const doPublish = !has('no-publish');
const fixComponents = has('fix-components');

if (!manifestPath) {
  console.error('usage: push-package.mjs --manifest <file.json> [--base URL] [--admin-email EMAIL] [--dry-run] [--no-publish]');
  console.error('       the admin password comes from PCMAX_ADMIN_PASSWORD, never an argument');
  process.exit(2);
}
if (!dryRun && (!adminEmail || !adminPassword)) {
  console.error('admin credentials required: --admin-email plus PCMAX_ADMIN_PASSWORD in the environment');
  process.exit(2);
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const pkgSpec = manifest.package;
if (!pkgSpec?.slug) throw new Error('manifest.package.slug is required');

// ---------------------------------------------------------------------------

let token = null;

async function api(method, path, body, extra = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${base}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined && !extra.raw ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(extra.headers ?? {}),
    },
    body: body === undefined ? undefined : (extra.raw ? body : JSON.stringify(body)),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return json;
}

async function login() {
  const r = await api('POST', '/admin/auth/login', { email: adminEmail, password: adminPassword });
  token = r?.accessToken ?? r?.data?.accessToken;
  if (!token) throw new Error('login returned no access token');
}

/** Find the package by slug, or create it. */
async function ensurePackage() {
  // Paginated, not a single big page: the limit is capped at 100 and the
  // catalog is already past that, so a one-shot fetch would silently miss an
  // existing package and create a duplicate slug instead of reusing it.
  let found = null;
  for (let page = 1; !found; page++) {
    const list = await api('GET', `/admin/packages?limit=100&page=${page}`);
    const rows = list?.data ?? [];
    found = rows.find((p) => p.slug === pkgSpec.slug) ?? null;
    if (!found && rows.length < 100) break;
  }
  if (found) {
    console.log(`  package ${pkgSpec.slug} already exists (${found.id}, ${found.status})`);
    return found;
  }
  const created = await api('POST', '/admin/packages', pkgSpec);
  const pkg = created?.data ?? created;
  console.log(`  created package ${pkgSpec.slug} (${pkg.id})`);
  return pkg;
}

/** Existing rows on the server, so a re-run skips only what genuinely landed. */
async function existingFiles(pkgId) {
  const r = await api('GET', `/admin/packages/${pkgId}/files`);
  const rows = (r?.data ?? []).map((f) => ({
    id: f.id, component: f.component, variant: f.variant ?? '', filename: f.filename,
  }));
  const sameSlot = (f, variant, filename) => f.filename === filename && f.variant === (variant ?? '');
  return {
    rows,
    // `component` belongs in this comparison. Without it a row that already
    // exists under the same variant and filename but the WRONG component reads
    // as "already uploaded", so the correct row is never created and the stale
    // one keeps driving an empty picker. That is what happened to OptiScaler's
    // six non-NATIVE orders, still tagged `installer` from an earlier upload:
    // the run reported success and changed nothing.
    has: (component, variant, filename) =>
      rows.some((f) => sameSlot(f, variant, filename) && f.component === component),
    /** Same slot, different component — superseded by this manifest. */
    misfiled: (component, variant, filename) =>
      rows.filter((f) => sameSlot(f, variant, filename) && f.component !== component),
  };
}

/**
 * Point a local-driver upload URL at the deployment we are actually addressing.
 * Anything else (an S3 presigned URL) is returned untouched.
 */
function rehostLocalUpload(uploadUrl) {
  let u;
  try { u = new URL(uploadUrl); } catch { return uploadUrl; }
  if (!u.pathname.includes('/uploads/packages/put/')) return uploadUrl;
  const wanted = new URL(base);
  if (u.origin === wanted.origin) return uploadUrl;
  console.log(`\n     note: server offered ${u.origin}, uploading to ${wanted.origin} instead`);
  console.log(`     (that server's PUBLIC_API_URL points elsewhere — worth fixing)`);
  u.protocol = wanted.protocol;
  u.host = wanted.host;
  return u.toString();
}

/**
 * Object keys already uploaded this run, by content hash.
 *
 * Some packages are the same binary under several names — OptiScaler's eight
 * "plans" are one 24 MB DLL renamed to whichever export the game loads
 * (dxgi, winmm, version…), so a naive run ships 195 MB of duplicates over a
 * home uplink. A manifest row only needs *a* stored object with the right
 * bytes, and deleting a file row leaves the object alone, so several rows can
 * safely share one upload.
 */
const uploadedByHash = new Map();

async function uploadOne(pkgId, filePath, spec) {
  const bytes = await readFile(filePath);
  const filename = basename(filePath);
  const hash = createHash('sha256').update(bytes).digest('hex');

  let objectKey = uploadedByHash.get(hash);
  if (objectKey) {
    process.stdout.write('(same bytes, reusing upload) ');
  } else {
    objectKey = await putBytes(pkgId, filename, bytes);
    uploadedByHash.set(hash, objectKey);
  }

  await api('POST', `/admin/packages/${pkgId}/files/complete`, {
    storageKey: objectKey,
    filename,
    size: bytes.length,
    destination: spec.destination ?? filename,
    operation: spec.operation ?? 'replace',
    role: spec.role ?? 'relative',
    component: spec.component ?? 'installer',
    ...(spec.variant ? { variant: spec.variant } : {}),
  });
}

/** Presign, PUT, and return the stored object key. */
async function putBytes(pkgId, filename, bytes) {
  const presign = await api('POST', `/admin/packages/${pkgId}/files/presign`, {
    filename,
    size: bytes.length,
  });
  const { uploadUrl, objectKey } = presign?.data ?? presign;
  if (!uploadUrl || !objectKey) throw new Error(`presign returned no uploadUrl/objectKey for ${filename}`);

  // The local driver builds this URL from the server's own PUBLIC_API_URL,
  // which is not necessarily the host we are talking to — a stack whose .env
  // carries another deployment's values hands back a URL pointing there, signed
  // with *this* server's secret, and the PUT lands on a host that cannot verify
  // it (a 403 that reads like a bad signature rather than a bad hostname).
  // We know which deployment we asked, so send it back to that one.
  //
  // Only for the local driver: an S3 presigned URL legitimately lives on
  // another host and must be used exactly as issued.
  const target = rehostLocalUpload(uploadUrl);

  const put = await putRaw(target, bytes);
  if (put.status < 200 || put.status >= 300) {
    throw new Error(`PUT ${target} -> ${put.status} ${put.text.slice(0, 200)}`);
  }
  return objectKey;
}

/**
 * Raw PUT over node:http(s) rather than fetch.
 *
 * fetch() caps the wait for response headers at 300s, and a PUT gets its
 * headers only once the whole body is in — so on a slow uplink the limit is a
 * stopwatch on the upload, not on the server. At the ~72 KB/s measured against
 * this deployment a 24 MB file needs ~360s and dies at 300 with
 * UND_ERR_HEADERS_TIMEOUT, having transferred nearly all of it. Which file
 * fails is then a matter of how the line happens to be behaving, which is a
 * miserable thing to debug.
 *
 * node:http has no such cap. Progress is printed because at this speed a file
 * takes minutes and a silent process is indistinguishable from a hung one.
 */
function putRaw(url, bytes) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isTls = u.protocol === 'https:';
    const req = (isTls ? httpsRequest : httpRequest)(
      {
        hostname: u.hostname,
        port: u.port || (isTls ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream', 'content-length': bytes.length },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('error', reject);

    const CHUNK = 256 * 1024;
    const big = bytes.length > 4 * 1024 * 1024;
    let sent = 0;
    const write = () => {
      while (sent < bytes.length) {
        const end = Math.min(sent + CHUNK, bytes.length);
        const ok = req.write(bytes.subarray(sent, end));
        sent = end;
        if (big && process.stdout.isTTY) process.stdout.write(`\r     ${(sent / 1048576).toFixed(1)}/${(bytes.length / 1048576).toFixed(1)} MB   `);
        if (!ok) { req.once('drain', write); return; }
      }
      if (big && process.stdout.isTTY) process.stdout.write('\r                                   \r');
      req.end();
    };
    write();
  });
}

// ---------------------------------------------------------------------------

console.log(`\npush-package — ${pkgSpec.slug} → ${base}${dryRun ? '  (dry run)' : ''}\n`);

// Resolve and validate every source folder before uploading anything, so a
// typo in the manifest fails now rather than halfway through 111 MB.
const plan = [];
for (const v of manifest.variants ?? []) {
  const dir = isAbsolute(v.dir) ? v.dir : join(REPO, v.dir);
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    console.error(`  ✗ variant "${v.name ?? '(base)'}": folder not found — ${dir}`);
    process.exit(1);
  }
  const files = [];
  for (const name of entries.sort()) {
    const full = join(dir, name);
    const st = await stat(full);
    if (!st.isFile()) continue;
    if (v.include && !v.include.includes(name)) continue;
    if (v.exclude?.includes(name)) continue;
    files.push({ path: full, size: st.size });
  }
  if (!files.length) {
    console.error(`  ✗ variant "${v.name ?? '(base)'}": no files in ${dir}`);
    process.exit(1);
  }
  plan.push({ ...v, dir, files });
}

const totalBytes = plan.reduce((n, v) => n + v.files.reduce((m, f) => m + f.size, 0), 0);
const totalFiles = plan.reduce((n, v) => n + v.files.length, 0);
for (const v of plan) {
  const mb = v.files.reduce((m, f) => m + f.size, 0) / 1048576;
  console.log(`  ${v.name ?? '(base)'} — ${v.files.length} file(s), ${mb.toFixed(1)} MB`);
  for (const f of v.files) console.log(`      ${basename(f.path)}`);
}
console.log(`\n  total: ${totalFiles} file(s), ${(totalBytes / 1048576).toFixed(1)} MB`);

// What actually goes over the wire, after identical files share one upload.
// Worth printing: for OptiScaler the two numbers differ by 170 MB, and knowing
// that up front is the difference between "this will take an hour" and not.
const seenHashes = new Map();
for (const v of plan) {
  for (const f of v.files) {
    const h = createHash('sha256').update(await readFile(f.path)).digest('hex');
    if (!seenHashes.has(h)) seenHashes.set(h, f.size);
  }
}
const uniqueBytes = [...seenHashes.values()].reduce((a, b) => a + b, 0);
if (seenHashes.size < totalFiles) {
  console.log(`  to upload: ${seenHashes.size} unique file(s), ${(uniqueBytes / 1048576).toFixed(1)} MB`
    + ` — ${totalFiles - seenHashes.size} duplicate(s) share an upload`);
}

if (dryRun) {
  console.log('\n  dry run — nothing was uploaded.\n');
  process.exit(0);
}

await login();
const pkg = await ensurePackage();
const already = await existingFiles(pkg.id);

let uploaded = 0, skipped = 0, retagged = 0;
for (const v of plan) {
  const component = v.component ?? 'installer';
  for (const f of v.files) {
    const name = basename(f.path);

    // Stale rows are handled BEFORE the already-uploaded check, not after. A
    // slot can hold both the correct row and a leftover under the wrong
    // component — that is the normal state after a half-fixed upload — and
    // checking "already present" first returns early and leaves the leftover
    // behind, silently doing nothing on the very run asked to clean it up.
    const stale = already.misfiled(component, v.name, name);
    if (stale.length) {
      if (fixComponents) {
        for (const st of stale) {
          await api('DELETE', `/admin/packages/${pkg.id}/files/${st.id}`);
          retagged++;
          console.log(`  ✗ removed ${st.variant || '(base)'}/${st.filename} (was component=${st.component})`);
        }
      } else {
        console.log(`  ⚠ ${v.name ?? '(base)'}/${name} also exists as component=${stale.map((x) => x.component).join(',')}`
          + ' — re-run with --fix-components to remove it');
      }
    }

    if (already.has(component, v.name, name)) {
      skipped++;
      console.log(`  ○ ${v.name ?? '(base)'}/${name} already uploaded`);
      continue;
    }
    process.stdout.write(`  ↑ ${v.name ?? '(base)'}/${basename(f.path)} (${(f.size / 1048576).toFixed(1)} MB) … `);
    await uploadOne(pkg.id, f.path, { ...v, variant: v.name });
    uploaded++;
    process.stdout.write('ok\n');
  }
}

if (doPublish && uploaded > 0) {
  await api('POST', `/admin/packages/${pkg.id}/publish`, { changeNote: manifest.changeNote ?? 'Uploaded via push-package' });
  console.log('  published');
} else if (doPublish) {
  console.log('  nothing new uploaded — leaving publish state alone');
}

console.log(`\n  ${uploaded} uploaded, ${skipped} already present${retagged ? `, ${retagged} stale row(s) removed` : ''}\n`);
