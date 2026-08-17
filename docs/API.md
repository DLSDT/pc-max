# API Reference

Base URL: `/api/v1` · Interactive docs: `GET /docs` (Swagger UI), `GET /docs/json` (OpenAPI).

The API contract is defined once in `packages/validation` (Zod) and shared by every client — the schemas are the source of truth; this document is a quick reference.

## Conventions

- **Success:** `{ "data": …, "meta": { page, limit, total } }` (meta on paginated lists)
- **Error:** `{ "error": { "code", "message", "details" } }` — 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 429 rate-limited, 500 internal
- **Auth:** `Authorization: Bearer <accessToken>` on admin routes
- **Rate limit:** 300 req/min/IP by default (per `RATE_LIMIT_MAX`)
- **Content headers:** `Cache-Control`/ETag on public GETs; images are CDN URLs

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
| PUT | `/uploads/put/:key` | Dev-only endpoint backing the local storage driver |

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
curl http://localhost:4000/api/v1/games/gta-v/optimizations
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
