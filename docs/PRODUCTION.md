# Production Guide

## 1. Overview

Production consists of three deployable units behind one PostgreSQL:

- **API** (`apps/api`) — Fastify. Stateless except the DB and object storage; horizontally scalable.
- **Admin panel** (`apps/admin`) — Next.js, built as static output + Node server for the auth/upload proxy routes.
- **Desktop app** (`apps/desktop`) — Windows installer built with Tauri 2 (NSIS). Served from a release/CDN endpoint.

## 2. Environment (API)

Set these in the deploy environment (never in code):

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `DATABASE_URL` | yes | Managed Postgres (e.g. RDS, Supabase, Neon). TLS recommended |
| `JWT_ACCESS_SECRET` | yes | ≥ 32 random bytes. The app **refuses to boot** with the dev default in production |
| `JWT_ACCESS_TTL` | no | default `15m` |
| `REFRESH_TTL_DAYS` | no | default `30` |
| `CORS_ORIGINS` | yes | Comma-separated allowed origins (admin domain + tauri origins) |
| `STORAGE_DRIVER` | yes | `local` or `s3` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_PUBLIC_BASE_URL` | when `s3` | Cloudflare R2 (endpoint `https://<account>.r2.cloudflarestorage.com`) or any S3-compatible bucket. Bucket must be public-read for images (or served via CDN) |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | yes (first boot) | Creates the first super-admin if none exists. Change the password immediately |
| `RATE_LIMIT_MAX` | no | default 300 req/min/IP |

### S3 storage driver

With `STORAGE_DRIVER=s3`, the admin panel uploads images directly to the bucket via **presigned URLs** — file bytes never pass through the API. Put the bucket behind a CDN (Cloudflare) and set `S3_PUBLIC_BASE_URL` to the CDN host so image URLs are served from the edge. The `local` driver is for development only.

## 3. Database

- **Migrations:** committed SQL in `apps/api/drizzle/`. Apply with `npm run db:migrate -w @goh/api` as part of the deploy (one-off job).
- **Seed:** `npm run db:seed -w @goh/api` creates demo content and the bootstrap admin. In production you typically seed once, then manage everything through the admin panel.
- **Backups:** standard Postgres tooling (`pg_dump` / managed DB snapshots). The `views` table is append-only analytics and can be truncated after rollups if you want to keep the DB small.

## 4. Build & deploy the API

```bash
cd apps/api
npm run build          # tsc → dist/
node dist/index.js     # or your platform's process manager
```

Scale path for 1k–10k users: one Node instance is enough. Beyond that: add a read replica and a cache (Redis) in front of public GETs — the endpoints already carry cache-friendly semantics (`/home`, `/sync`).

## 5. Build & deploy the admin panel

```bash
cd apps/admin
cp .env.example .env.local        # set NEXT_PUBLIC_API_URL to the deployed API
npm run build
npm start                         # Next.js server (required for auth proxy routes)
```

The panel talks to the API only through its own `/api/auth/*` Next routes, so `NEXT_PUBLIC_API_URL` is the only external config.

## 6. Build the Windows desktop installer

```bash
cd apps/desktop
export VITE_API_URL=https://api.yourdomain.com/api/v1   # do NOT bake in a localhost URL
npm run build
npm run tauri:build -w @goh/desktop
```

Output: `apps/desktop/src-tauri/target/release/bundle/nsis/*.exe` (plus MSI if configured). Requires the Rust toolchain and Windows (or cross-compilation setup) — build in CI on `windows-latest`.

**Secrets policy:** the desktop bundle contains *no* credentials — only the public API base URL at build time. Nothing else.

## 7. Auto-update

Both mechanisms are wired and shipping. Neither needs enabling.

1. **Update banner** — the app calls `GET /api/v1/app/version?current=…&platform=windows`
   on boot and shows an "Update available" pill when `updateAvailable` is true.

2. **Tauri updater** — `tauri-plugin-updater` is in `src-tauri/Cargo.toml`, registered
   in `src/lib.rs`, `createUpdaterArtifacts` is on, the minisign public key and the
   endpoint (`/api/v1/updates/{{target}}/{{arch}}/{{current_version}}`) are set in
   `tauri.conf.json`, and `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD` are configured as
   GitHub secrets. `.github/workflows/build-windows.yml` produces the installer and its
   detached `.sig`.

### Publishing a release

Building an installer does **not** make it an update. The feed serves nothing until a
row exists in `app_versions`, which is why a fresh deployment answers `204` to every
client. After a green `build-windows-installer` run:

1. Download the workflow artifact — it holds `PC MAX_<version>_x64-setup.exe` and the
   matching `.sig`.
2. Host the `.exe` somewhere clients can reach and note the URL.
3. Admin panel → **Releases** → create a version with that URL, and paste the **entire
   contents of the `.sig` file** into the signature field.
4. Confirm it: `curl -i https://<api>/api/v1/updates/windows/x86_64/<older-version>`
   must return `200` with that version, and the same call with the new version must
   return `204`.

Rules the API enforces, so you cannot half-publish:

- A release with no signature is never offered and can never be marked latest — the
  Releases table shows it as **Not signed** and disables the pin button. Clients would
  silently stop receiving updates otherwise.
- "Latest" is the highest semver **among signed releases**, recomputed on every create,
  edit and delete.
- To roll back, mark the older release latest from the Releases tab. That pins it until
  the next release mutation, and the change is recorded in the audit log.

## 8. Security checklist (what is already enforced)

- ✅ argon2id password hashing (`@node-rs/argon2`); no plaintext anywhere
- ✅ Access JWT (15 min) + rotating refresh tokens hashed in the `sessions` table, `httpOnly` + `SameSite=Strict` cookie
- ✅ RBAC permission map enforced in middleware (super_admin / admin / editor / viewer)
- ✅ Zod validation on every input; parameterized Drizzle queries (SQLi-safe)
- ✅ `@fastify/helmet` headers, CORS allowlist, rate limiting on all routes
- ✅ Upload allowlist (`jpeg/png/webp`, ≤ 10 MB), random object keys, no path traversal
- ✅ Audit log for every admin mutation (`audit_logs`)
- ✅ No secrets in client bundles; `.env.example` committed, real values never

## 9. Monitoring & analytics

- **Analytics** (`/admin/dashboard`, `/admin/analytics/*`) are privacy-friendly: anonymous device IDs only, no IPs, no PII. `games.view_count` / `profiles.view_count` are denormalized counters incremented transactionally with each view — no `COUNT(*)` scans.
- **Logs:** Fastify pino logger; ship to your log aggregator. Watch for 401 bursts (brute-force attempts) and 4xx validation errors.
- **Health:** `GET /api/v1/health` for load balancer probes.

## 10. Suggested CI pipeline

```
on: push → typecheck + test (workspaces)
on: tag v* →
  - build API + admin, run migrations job
  - build desktop on windows-latest → tauri build → NSIS installer
  - sign updater manifest, upload release artifacts
  - publish app_versions row (release notes, checksum, download URL)
```

## 11. Running more than one API process

The API is a single-threaded Node process. Two things had to be true before a
second one could be added, and both now are:

- **rate-limit counters live in Redis** (`lib/rate-limit-store.ts`). In memory
  each process keeps its own tally, so three replicas would enforce three times
  the configured limit and which one you landed on would decide whether you were
  refused.
- **verification mail is taken with `BRPOP`** (`lib/mail-queue.ts`), so a job
  goes to exactly one process however many are draining the queue.

`DB_POOL_MAX` (default 10) is per process. Postgres allows 100 connections by
default, so replicas x `DB_POOL_MAX` has to stay comfortably under that.

### Why there is no compose overlay for this yet

The obvious shape — several replicas of one service behind a small nginx that
finds them through Docker's DNS — does not work on this server. Production runs
with `docker-compose.hostnet.yml` because Docker's bridge networking is broken
on it (see that file). On the host network there are no container hostnames to
resolve and `ports:` does nothing, so replicas cannot be told apart by name and
would all try to bind `127.0.0.1:4000`.

What fits this host instead:

1. Define `api2`, `api3` as their own services extending `api`, each with
   `PORT: 4001`, `4002`, still bound to `127.0.0.1`.
2. Load-balance in the nginx that is already there — aaPanel's, not a new
   container:

   ```nginx
   upstream pcmax_api {
       least_conn;
       server 127.0.0.1:4000;
       server 127.0.0.1:4001;
       server 127.0.0.1:4002;
   }
   # in the site's proxy conf: proxy_pass http://pcmax_api;
   ```

3. Lower `RETENTION_INTERVAL_HOURS` to `0` on every replica but one, or the
   nightly trim runs once per process. The deletes are keyed on
   `expires_at < now()` and scan in the same order, so the repeats find nothing
   and cannot deadlock — wasteful rather than harmful, but there is no reason
   to pay it three times.

Worth doing when traffic asks for it. It is a change to the live topology and
wants its own deploy window, not one shared with a release the client is
testing.
