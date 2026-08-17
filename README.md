# PC MAX

PC MAX is a production-ready, premium Windows gaming optimization platform. Browse a library of games, view per-game **recommended graphics settings** and optimization profiles (Maximum FPS → Ultra Quality) — all delivered dynamically from a backend, so **new games and optimizations appear without rebuilding the desktop app**.

Three surfaces, one API, one database:

| Surface | Stack | Purpose |
|---|---|---|
| **Desktop app** (`apps/desktop`) | Tauri 2 · React 19 · Vite · Tailwind · TanStack Query · i18n (en/fa, RTL) | Windows app: Home, Games (search/filter), Game Detail, Favorites, Recently Viewed, Settings, About. Cache-first + offline mode |
| **Admin panel** (`apps/admin`) | Next.js 15 · Tailwind · shadcn-style UI | Full content management: games, uploads, optimization profiles/settings/options, versioning, categories/tags, releases, admins, audit, analytics |
| **API** (`apps/api`) | Fastify 5 · Drizzle ORM · PostgreSQL | Single source of truth. Public anonymous API for the desktop app + authenticated RBAC admin API. OpenAPI spec at `/docs` |

## Core product rule

> **No game, setting or optimization value is hardcoded in any client.** An admin adds *Cyberpunk 2077* with profiles in the panel today → a user sees it in the desktop app on next sync. No app rebuild, ever.

## Quick start (zero Docker required)

```bash
npm install

# Terminal 1 — API with embedded PostgreSQL (migrations + seed included)
npm run dev:embedded -w @goh/api
# → http://127.0.0.1:4000/api/v1  (docs at /docs)
#   Admin login: admin@gamehub.local / Admin123!

# Terminal 2 — desktop app (Vite dev server, Tauri-ready)
npm run dev -w @goh/desktop
# → http://localhost:1420

# Terminal 3 — admin panel
npm run dev -w @goh/admin
# → http://localhost:3001  (login with the admin credentials above)
```

The API runs on an embedded PostgreSQL — **no Docker or local Postgres needed**. Teams that prefer Docker can use `infrastructure/docker-compose.yml` instead (see [docs/SETUP.md](docs/SETUP.md)).

## Repo layout

```
apps/
  desktop/   Tauri 2 desktop app (React UI + Rust shell)
  admin/     Next.js admin panel
  api/       Fastify API + Drizzle schema, migrations, seed, tests
packages/
  validation/  Zod schemas — the single source of the API contract
  types/       TS types derived from those schemas (z.infer)
docs/          ARCHITECTURE · SETUP · PRODUCTION · API
infrastructure/  docker-compose (optional Postgres)
```

## Verification status

Everything below is verified in this repo:

- ✅ **API** — 29 integration tests pass against a real (embedded) PostgreSQL: admin adds a game → public API serves it instantly; version bumps (`1.0.0 → 1.0.1`); RBAC blocks viewers; audit logs record every mutation; refresh-token rotation; pagination/sort; sync manifests hide drafts/archives so unpublishes propagate to desktop clients; admin search matches slugs.
- ✅ **Admin panel** — typechecks and production-builds cleanly.
- ✅ **Desktop app** — typechecks and builds (118 kB gzip JS). Verified live in a browser: Home hero + sections, Games search/filter, Game Detail with server-driven settings tables, profile switching, Persian RTL, online/offline states.
- ✅ **Migrations** — committed SQL in `apps/api/drizzle`, applied by the embedded bootstrap and the test suite.

## Windows installer (.exe)

The desktop app ships as a Windows NSIS installer. Tauri's bundler needs a Windows machine (or Windows CI), so the repo includes a ready-made pipeline:

1. **CI (recommended):** push to GitHub, then run the **build-windows-installer** workflow (`.github/workflows/build-windows.yml`). Download the `goh-windows-setup` artifact — it contains `Game Optimization Hub_0.1.0_x64-setup.exe`.
2. **Locally on Windows** (Node ≥ 18.18 + [Rust](https://rustup.rs) stable/MSVC):
   ```bash
   npm ci
   npm run tauri:build -w @goh/desktop
   ```
   Output: `apps/desktop/src-tauri/target/release/bundle/nsis/Game Optimization Hub_0.1.0_x64-setup.exe`

For the full release checklist (uploading the installer, creating an App Release in the admin panel, and wiring the Tauri updater), see [docs/PRODUCTION.md](docs/PRODUCTION.md).

## Scripts

```bash
npm run build          # build all workspaces
npm run typecheck      # typecheck all workspaces
npm run test           # API unit + integration tests
npm run db:migrate     # apply migrations (needs DATABASE_URL)
npm run db:seed        # seed the database (needs DATABASE_URL)
npm run dev:embedded   # API + embedded Postgres, one command
```

See [docs/SETUP.md](docs/SETUP.md) (development), [docs/PRODUCTION.md](docs/PRODUCTION.md) (deployment, auto-update, security) and [docs/API.md](docs/API.md) (endpoint reference).

🇮🇷 **راهنمای فارسی کامل** (راهنمای مدیر، راهنمای کاربر، راه‌اندازی سریع): [README_FA.md](README_FA.md)
