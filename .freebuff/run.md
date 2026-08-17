# Run doc — Game Optimization Hub live preview

How to reproduce the uncommitted artifacts a fresh checkout needs, and how to
run the servers for a live preview (desktop app + API).

## Reproduce artifacts

1. **Install dependencies** (npm workspaces monorepo):
   ```bash
   cd /home/omid/Desktop/game-optimization-hub && npm install
   ```
2. **Build the shared validation package** (the API and apps consume its
   compiled `dist/` output):
   ```bash
   npm run build -w packages/validation
   ```
3. **No env files are required.** The desktop app's API base URL defaults to
   `http://localhost:4000/api/v1` (`apps/desktop/src/lib/config.ts`, injectable
   via `VITE_API_URL`). The dev API self-configures inline. For a non-dev API
   deployment, copy `apps/api/.env.example` → `.env` and adjust.

## Run the servers

The desktop app (Vite, fixed port **1420**) talks to the API (port **4000**).

1. **API** (embedded PostgreSQL, migrations + seed run on boot — no Docker):
   ```bash
   cd apps/api && npx tsx scripts/dev-embedded.ts
   # → http://127.0.0.1:4000/api/v1  (admin: admin@gamehub.local / Admin123!)
   ```
2. **Desktop app**:
   ```bash
   cd apps/desktop && npm run dev
   # → http://127.0.0.1:1420
   ```
3. **Admin panel** (Next.js, port 3001):
   ```bash
   cd apps/admin && npm run dev -- -p 3001
   # → http://localhost:3001  (login cookie is scoped to `localhost`, not 127.0.0.1)
   ```
   If the admin serves 404s for its own chunks, the `.next` cache is stale:
   stop it, `rm -rf apps/admin/.next`, and start again.

All three may be launched detached with `setsid` so they outlive the session.

## Catalog import (icon pack → database)

```bash
npm run catalog:import -w @goh/api
# Scans /icon/game icon/ (280 folders → 282 games incl. 2 curated), converts
# icons to PNGs, regenerates apps/desktop/src/lib/gameIcons.ts. Idempotent:
# re-running never creates duplicates. Runs automatically on API boot while
# the catalog is incomplete (<280 games).
```

## Production / containerized (Phase 21)

```bash
# Full local stack (postgres + minio + redis + API)
docker compose -f infrastructure/docker-compose.yml up -d

# API image only
docker build -t goh-api -f apps/api/Dockerfile .
```

The API image applies migrations on start and serves on 4000. Set
`JWT_ACCESS_SECRET` and `DOWNLOAD_SIGNING_SECRET` (production fails to boot on
the dev defaults). Windows installer: GitHub Actions
`.github/workflows/build-windows.yml` → NSIS `.exe` artifact.
