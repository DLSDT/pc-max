# API Reference

Base URL: `/api/v1` · Interactive docs: `GET /docs` (Swagger UI), `GET /docs/json` (OpenAPI).

The API contract is defined once in `packages/validation` (Zod) and shared by every client — the schemas are the source of truth; this document is a quick reference.

## Conventions

- **Success:** `{ "data": …, "meta": { page, limit, total } }` (meta on paginated lists)
- **Error:** `{ "error": { "code", "message", "details" } }` — 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 429 rate-limited, 500 internal
- **Auth:** `Authorization: Bearer <accessToken>` on admin routes
- **Rate limit:** 300 req/min/IP by default (per `RATE_LIMIT_MAX`). Rate-limited requests return **429 `RATE_LIMITED`** (never 500). The anonymous analytics endpoint `/views` has its own stricter per-IP bound (`RATE_LIMIT_VIEWS`, default 120/min) and `/auth/password/forgot` allows 10/min.
- **Content headers:** `Cache-Control`/ETag on public GETs; images are CDN URLs
- **Monitoring:** with `SENTRY_DSN` set, unhandled 500s and payment-verification failures are captured (redacted — secrets stripped, emails masked, query strings dropped)

## Public endpoints (desktop app, anonymous)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/home` | One round-trip Home payload: `featured` (hero), `popular`, `recentlyAdded`, `categories` |
| GET | `/games` | Paginated library. Query: `q` (name/genre/tag/slug), `genre` (slug), `year`, `techs` (`dlss,fsr,xess,ray_tracing,frame_generation,nvidia,amd,intel` — comma or repeated), `sort` (`popular`·`new`·`rating`·`name`), `page`, `limit` (≤100) |
| GET | `/games/:slug` | Full detail: metadata, technologies, images, requirements (minimum/recommended), categories, tags, rating, view count |
| GET | `/games/:slug/optimizations` | All published profiles with settings (grouped by optimization category) and options |
| GET | `/games/:slug/optimizations/:profileSlug` | Single profile |
| GET | `/categories` | Browse categories with game counts |
| GET | `/featured` | Featured games (hero candidates) |
| GET | `/sync?since=ISO&platform=windows` | **Incremental content sync.** Returns games/profiles/categories changed after `since` (each with `deleted` flag) + global `contentUpdatedAt`. Full manifest when `since` is omitted. Backbone of the desktop offline cache |
| GET | `/app/version?current=&platform=windows&channel=stable` | Latest release + `updateAvailable` |
| GET | `/settings` | Public app settings |
| POST | `/users/device` | Register an anonymous device → `{ userId, deviceId }` |
| POST | `/views` | Anonymous analytics event (`deviceId`, optional `gameId`/`profileId`) |

## Admin endpoints (JWT + RBAC)

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/admin/auth/login` | Email + password → `{ accessToken }` + httpOnly refresh cookie |
| POST | `/admin/auth/refresh` | Rotates the refresh token |
| POST | `/admin/auth/logout` | Revokes the session |
| GET | `/admin/auth/me` | Current admin + resolved permissions |

### Games
| Method | Path | Description |
|---|---|---|
| GET/POST | `/admin/games` | List (with filters) / create (name, slug, tech flags, genres, tags, rating, featured, status) |
| GET/PATCH/DELETE | `/admin/games/:id` | Read / update / soft-delete |
| POST | `/admin/games/:id/publish` | Publish / unpublish (draft → published → archived) |
| POST | `/admin/games/:id/images` | Attach an uploaded object (cover/background/logo/screenshot) |
| DELETE | `/admin/games/:id/images/:imageId` | Remove an image |
| PUT | `/admin/games/:id/requirements` | Set minimum + recommended requirements |
| GET | `/admin/games/:gameId/profiles` | Profiles of a game |

### Uploads
| Method | Path | Description |
|---|---|---|
| POST | `/admin/uploads/presign` | `{ kind, contentType, size }` → `{ uploadUrl, objectKey, publicUrl }`; the browser PUTs bytes directly to storage |
| PUT | `/uploads/put/:exp/:sig/*` | Local storage driver's write path. Unauthenticated by design — the HMAC and expiry minted by `presign` **are** the authorisation, and are verified constant-time |
| PUT | `/uploads/packages/put/:exp/:sig/*` | Same, for package files. Streams to disk; extension allowlist and 500 MB cap enforced here, not only at presign |

### Optimization profiles
| Method | Path | Description |
|---|---|---|
| POST | `/admin/games/:gameId/profiles` | Create profile (slug, name, description, targetFps, hardwareTier, isDefault, version) |
| GET/PATCH/DELETE | `/admin/profiles/:id` | Read / update / delete |
| POST | `/admin/profiles/:id/publish` | Publish / unpublish |
| POST | `/admin/profiles/:id/versions` | **Bump semver** (default `patch`) + snapshot + change note |
| GET | `/admin/profiles/:id/versions` | Version history |
| POST | `/admin/profiles/:id/settings` | Add a setting (key, name, type, value, categorySlug, sortOrder) |
| PATCH/DELETE | `/admin/settings/:id` | Update / delete a setting |
| POST | `/admin/settings/:id/options` | Add an option (value, label, isRecommended, sortOrder) |
| PATCH/DELETE | `/admin/options/:id` | Update / delete an option |

### Taxonomy
| Method | Path | Description |
|---|---|---|
| GET/POST | `/admin/categories` · `/admin/tags` · `/admin/optimization-categories` | List / create |
| PATCH/DELETE | `…/:id` | Update / delete |

### Releases, admins, analytics, audit
| Method | Path | Description |
|---|---|---|
| GET/POST | `/admin/app-versions` | List / create desktop release (version, channel, releaseNotes, downloadUrl, checksum) |
| PATCH | `/admin/app-versions/:id` · `/admin/app-versions/:id/state` | Update / mark latest |
| DELETE | `/admin/app-versions/:id` | Delete |
| GET/POST | `/admin/admins` | List / create admins (**super_admin only**) |
| PATCH/DELETE | `/admin/admins/:id` | Update role / delete |
| GET | `/admin/dashboard` | Stats: total/active users, games, profiles, top games, recent additions |
| GET | `/admin/audit-logs` | Paged audit trail |

## Account endpoints (desktop app, end users)

```
POST /auth/register        # { email, username?, password } → { accessToken, user } + refresh cookie
POST /auth/login           # { email, password } → { accessToken, user } + refresh cookie
POST /auth/refresh         # rotate refresh cookie → new access token
POST /auth/logout          # revoke session
POST /auth/password/forgot # { email } → always ok; resetToken returned in non-production
POST /auth/password/reset  # { token, newPassword } → revokes all sessions
GET  /auth/me              # current profile
GET  /me                   # profile
PATCH /me                  # { username? }
GET  /me/subscription      # { subscription, entitlements, isActive } — server-side entitlement check
GET  /me/devices           # registered devices
POST /me/devices           # { deviceId (≥16 chars), name?, platform } — plan device limit enforced
DELETE /me/devices/:id     # soft-revoke a device
```

## Subscription & payment endpoints

```
GET  /subscriptions/plans                          # active plans (public storefront)
POST /subscriptions/purchase                       # { planId, idempotencyKey } → payment + redirect URL (idempotent)
GET  /payments/:provider/callback?authority=&paymentId=   # provider redirect target — server-side verify + activate
POST /payments/:provider/callback                  # same, JSON body (provider: mock | zarinpal)
```

Activation is **always server-side**: the callback re-verifies the payment with
`PaymentProvider.verifyPayment` before the subscription becomes active. The
`mock` provider auto-verifies (dev/tests); `zarinpal` uses the v4 REST API
(sandbox by default). Payments are idempotent via `idempotencyKey` and repeated
callbacks are harmless.

## Admin: users, subscriptions, plans, payments

```
GET    /admin/users?q=&status=&page=&limit=        # search email/username/deviceId
GET    /admin/users/:id                            # detail + devices + subscriptions
PATCH  /admin/users/:id                            # { status: active|suspended, username? }
GET    /admin/subscriptions?status=&page=&limit=   # join user + plan
PATCH  /admin/subscriptions/:id                    # { status?, extendDays? }
GET    /admin/subscriptions/plans                  # all plans (incl. inactive)
POST   /admin/subscriptions/plans                  # create plan (fully dynamic)
PATCH  /admin/subscriptions/plans/:id              # edit price/duration/deviceLimit/features/status
DELETE /admin/subscriptions/plans/:id              # soft-disable (status → inactive)
GET    /admin/payments?page=&limit=                # transactions with user + plan context
POST   /admin/payments/manual-grant                # { userId, planId, durationDays? } support flow
```

Permissions: `users.read/write`, `subscriptions.read/write`, `payments.read`
(super_admin/admin manage; viewer reads only).

## Hardware, packages & optimization engine (Phases 7–11)

```
# User hardware profile (desktop auto-uploads after detection)
PUT /me/hardware                # { cpu?, gpuVendor?, gpuModel?, vramMb?, ramGb?, windowsVersion?, arch?, resolution?, driverVersion? }
GET /me/hardware                # latest stored profile

# Compatibility engine (public — runs server-side, deterministic scoring)
POST /hardware/recommend        # { gameSlug, hardware } → { recommended?, alternatives, reasons, scored }

# Packages (public storefront + entitlement-gated download)
GET  /games/:slug/packages                  # published packages for a game
GET  /games/:slug/packages/:packageSlug     # detail + manifest (no URLs)
POST /games/:slug/packages/:packageSlug/download   # 403 without premium_optimization; else manifest + per-file SIGNED URLs
GET  /api/v1/uploads/signed/:exp/:sig/*            # local driver — HMAC-validated, TTL-bounded file fetch
GET  /admin/packages/:id/versions                  # release history (manifest snapshot per publish)

# Admin — packages (create → upload → complete(hash) → publish)
GET    /admin/packages?gameId=&status=&page=&limit=
GET    /admin/packages/:id
POST   /admin/packages                       # { gameId, name, slug, gpuVendor, gpuFamily?, minVramMb?, minRamGb?, minWindows?, arch, targetFps?, ... }
PATCH  /admin/packages/:id
DELETE /admin/packages/:id                   # soft delete
POST   /admin/packages/:id/archive
POST   /admin/packages/:id/publish           # { changeNote? } → semver bump + manifest snapshot
POST   /admin/packages/:id/files/presign     # { filename, size } → { uploadUrl, objectKey } (local PUT or S3 presigned)
PUT    /uploads/packages/put/:key            # direct upload (local driver; extension allowlist enforced)
POST   /admin/packages/:id/files/complete    # { storageKey, filename, size, destination, operation } → server-computed SHA-256
DELETE /admin/packages/:id/files/:fileId

# Admin — ops (Phase 7)
GET    /admin/devices?page=&limit=           # all users' registered devices
POST   /admin/devices/:id/revoke
GET    /admin/security/login-attempts?page=&limit=&outcome=   # failed/successful login audit
GET    /admin/settings                       # remote config (announcement, maintenance, min version)
PUT    /admin/settings                       # { settings: { announcement?, maintenance_mode?, min_app_version? } }
GET    /config                               # public — desktop fetches on every sync (no rebuild needed)
```

Package files are restricted to a safe extension allowlist (never executables),
SHA-256 is computed **server-side** at finalize time, and download is always
entitlement-gated — the desktop never decides premium status.

**Secure downloads (Phase 12):** file URLs in the download response are
short-lived **signed** links (`expiresIn` seconds). Local driver: HMAC-SHA256
signature + expiry validated constant-time at `/api/v1/uploads/signed/...`;
S3/R2 driver: presigned GET against the private bucket. The raw object path is
never public (403 on `/uploads/packages/*` locally; private bucket on S3).
Configure `DOWNLOAD_SIGNING_SECRET` (mandatory in production) and
`DOWNLOAD_URL_TTL` (default 900s).

**Backup/restore (Phase 13, desktop):** applied packages are recorded locally;
Settings → Backups snapshots them (with favorites + language) and Restore
re-verifies each package server-side. Desktop-side only — see `lib/backup.ts`.

**Caching (Phase 16):** the desktop sync hits the cached variants —
`GET /home/cached` and `GET /games/cached` (catalog TTL 30s) — and
`GET /subscriptions/plans` + `GET /config` are served from the config cache
(TTL 60s). All four return `Cache-Control` headers. Cache is invalidated after
admin edits (games, plans, settings). Backend: in-process TTL cache, or shared
Redis when `REDIS_URL` is set (graceful fallback on failure).

**Production (Phase 21):** `docker build -f apps/api/Dockerfile .` builds a
slim image that runs migrations (`node dist/db/migrate.js`) then serves
(`node dist/index.js`). `infrastructure/docker-compose.yml` brings up
postgres + minio + redis + the API. Windows installer via
`.github/workflows/build-windows.yml` (NSIS `.exe`).

## RBAC matrix

| Role | Games | Optimizations | Taxonomy | Admins | Analytics | Audit |
|---|---|---|---|---|---|---|
| `super_admin` | full | full | full | full | full | full |
| `admin` | full | full | full | — | full | view |
| `editor` | create/edit | create/edit | create/edit | — | view | — |
| `viewer` | read | read | read | — | view | — |

Roles are enforced by middleware (permission map in `apps/api/src/lib/rbac.ts`), never only in the UI.

## Example: full round trip

```bash
# Anonymous desktop flow
curl http://localhost:4000/api/v1/home
curl "http://localhost:4000/api/v1/games?q=gta&techs=dlss,fsr"
curl http://localhost:4000/api/v1/games/cyberpunk-2077/optimizations
curl "http://localhost:4000/api/v1/sync?since=2026-08-17T00:00:00Z"

# Admin flow
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/admin/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@gamehub.local","password":"Admin123!"}' | jq -r .accessToken)

curl -X POST http://localhost:4000/api/v1/admin/games \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Cyberpunk 2077","slug":"cyberpunk-2077","status":"published","technologies":{"dlss":true,"fsr":true,"ray_tracing":true}}'
# → appears in GET /games immediately
```
