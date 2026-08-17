# Development Setup

## Prerequisites

- **Node.js ≥ 18.18** and npm ≥ 10
- **Windows 10/11** for the desktop app (the web UI also runs in any browser during development)
- Optional: Docker (for the Postgres container route), Rust toolchain (for `tauri build`)

## 1. Install

```bash
cd game-optimization-hub
npm install
```

`npm install` builds the shared packages (`@goh/validation`, `@goh/types`) via the root `prepare` hook.

## 2. Run the API — two options

### Option A: embedded PostgreSQL (recommended, zero deps)

```bash
npm run dev:embedded -w @goh/api
```

This boots an embedded PostgreSQL (data in `apps/api/data/dev-pg`), applies migrations, seeds **14 games + 56 optimization profiles**, and starts the API on `http://127.0.0.1:4000`.

- OpenAPI docs: `http://127.0.0.1:4000/docs`
- Health: `http://127.0.0.1:4000/api/v1/health`
- Bootstrap admin: `admin@gamehub.local` / `Admin123!` *(change after first login)*

### Option B: Docker Postgres

```bash
docker compose -f infrastructure/docker-compose.yml up -d
cp apps/api/.env.example apps/api/.env   # adjust DATABASE_URL if needed
npm run db:migrate -w @goh/api
npm run db:seed -w @goh/api
npm run dev -w @goh/api
```

The default compose file exposes Postgres on `localhost:5432` with `goh/goh`.

## 3. Run the desktop app

```bash
npm run dev -w @goh/desktop
```

- Web preview: `http://localhost:1420` (the full UI runs in a browser; Tauri adds the native window)
- Native window (Windows + Rust toolchain): `npm run tauri:dev -w @goh/desktop`
- The app talks to the API at `http://localhost:4000/api/v1` by default — override with `VITE_API_URL` at build time for a deployed API.

## 4. Run the admin panel

```bash
npm run dev -w @goh/admin
```

- Login at `http://localhost:3001/login` with the bootstrap admin.
- The admin proxies auth/upload calls to the API via its own Next routes (see `apps/admin/app/api`), so only `API_URL` needs pointing at the API.

## 5. Tests

```bash
npm run test             # API unit + integration tests (embedded Postgres, ~1–2 min)
npm run typecheck        # every workspace
npm run build            # every workspace (desktop = tsc + vite build)
```

## 6. Database management

```bash
npm run db:migrate -w @goh/api   # apply migrations
npm run db:seed -w @goh/api      # seed demo content + bootstrap admin
npm run db:studio -w @goh/api    # Drizzle Studio
```

Migrations are committed SQL under `apps/api/drizzle/`. The schema lives in `apps/api/src/db/schema.ts` (19 tables).

## 7. Images / uploads (dev)

With the default `STORAGE_DRIVER=local`, uploaded files land in `apps/api/uploads` and are served by the API at `/uploads/…`. For production use the S3/R2 driver (see PRODUCTION.md).

## 8. Placeholder app icons

```bash
npm run icons -w @goh/desktop     # regenerates src-tauri/icons (PNG + ICO, zero deps)
```

## Environment files

- `apps/api/.env.example` → copy to `.env` for custom config (DB URL, JWT secrets, storage, admin bootstrap).
- `apps/admin/.env.example` → `API_URL` (default `http://localhost:4000`), cookie secrets for the Next auth proxy.
- `apps/desktop` → `VITE_API_URL` (default `http://localhost:4000/api/v1`).

Never commit real `.env` files — they are gitignored.
