<div align="center">

<img src="apps/desktop/public/icon.png" alt="" width="88" />

# PC MAX

**Per-game graphics settings and Windows tuning for PC gamers — delivered from a server, not baked into the app.**

[![CI](https://github.com/DLSDT/pc-max/actions/workflows/ci.yml/badge.svg)](https://github.com/DLSDT/pc-max/actions/workflows/ci.yml)
[![Windows installer](https://github.com/DLSDT/pc-max/actions/workflows/build-windows.yml/badge.svg)](https://github.com/DLSDT/pc-max/actions/workflows/build-windows.yml)
![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Fastify 5](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

[Persian README](README_FA.md) · [Architecture](docs/ARCHITECTURE.md) · [Setup](docs/SETUP.md) · [API](docs/API.md) · [Deploy](docs/DEPLOY-VPS.md)

</div>

---

## What it is

A Windows desktop app backed by its own API. Users browse a catalogue of games,
see optimized graphics settings for each one, and tune Windows itself — with a
full snapshot and one-click rollback before anything is changed.

The rule the whole design follows:

> **No game, setting or optimization value is hardcoded in any client.** An
> admin adds a game with its profiles today; users see it on their next sync.
> No app rebuild, ever.

## What's in the box

| Part | Stack | What it does |
|---|---|---|
| **Desktop** `apps/desktop` | Tauri 2 · React 19 · Vite · Tailwind · TanStack Query | The Windows app. Catalogue, per-game settings, Multi-Frame Generation, Windows Optimizer, offline-first cache, English/Persian with RTL. The admin panel lives here too, behind a role check |
| **API** `apps/api` | Fastify 5 · Drizzle · PostgreSQL | Single source of truth. Public catalogue, authenticated user API, RBAC admin API, OpenAPI at `/docs` |
| **Contracts** `packages/` | Zod | `validation` holds the schemas; `types` is `z.infer` over them, so client and server cannot drift |

The Windows-only work — registry, services, scheduled tasks, game file installs
— is Rust (`apps/desktop/src-tauri`), applied as a transaction that rolls back
in full if any step fails.

## Quick start

No Docker required — the API boots its own PostgreSQL.

```bash
npm install

# Terminal 1 — API + embedded Postgres (migrations and seed included)
npm run dev:embedded -w @goh/api      # → http://127.0.0.1:4000/api/v1  (docs at /docs)

# Terminal 2 — desktop app
npm run dev -w @goh/desktop           # → http://localhost:1420
```

The first run prints the bootstrap admin credentials. In production the API
**refuses to start** with those defaults — along with a localhost
`PUBLIC_API_URL`, a development CORS policy, the mock payment gateway, or the
placeholder JWT secret. Each of those silently breaks something that still
looks healthy from the outside, so they fail at boot instead.

Prefer Docker? `infrastructure/docker-compose.yml`, and see
[docs/SETUP.md](docs/SETUP.md).

## Layout

```
apps/
  desktop/          Tauri 2 app — React UI, Rust shell, admin panel
    src-tauri/      Windows Optimizer, game-file installer, hardware detection
  api/              Fastify API, Drizzle schema, migrations, seed, tests
packages/
  validation/       Zod schemas — the API contract
  types/            TS types inferred from them
docs/               ARCHITECTURE · SETUP · API · PRODUCTION · DEPLOY-VPS · AUDIT
infrastructure/     docker-compose + the `pcmax` ops helper
```

## Tests

```bash
npm run typecheck                                   # every workspace
npm run test                                        # API + desktop
cd apps/desktop/src-tauri && cargo test             # Windows Optimizer engine
```

**235 automated tests**, all run in CI on every push:

| Suite | Count | Covers |
|---|---|---|
| API | 151 | auth, payment verification and activation, subscription gating, pagination integrity, retention, migrations |
| Desktop | 48 | offline session restore, hardware detection, genre labels, updater config, package extensions |
| Rust | 36 | registry/service/task changes, rollback on partial failure, path-traversal defence |

Most of them exist because something broke first: each is written to fail
against the bug it describes, and that was checked by reverting the fix.

## Windows installer

Tauri's bundler needs Windows, so CI builds it.

1. **From CI** — the [build-windows-installer](https://github.com/DLSDT/pc-max/actions/workflows/build-windows.yml)
   workflow runs on every push touching the desktop app. Download the
   `pcmax-windows-setup` artifact: it holds the NSIS installer and its detached
   `.sig`.
2. **Locally on Windows** — Node ≥ 18.18 and [Rust](https://rustup.rs)
   stable/MSVC:
   ```bash
   npm ci && npm run tauri:build -w @goh/desktop
   ```

Building an installer does **not** publish an update. The updater feed serves
nothing until the release is registered with its signature — see
[docs/PRODUCTION.md](docs/PRODUCTION.md#publishing-a-release).

## Deploying

[docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md) is the runbook that was actually
followed for the live deployment, including the parts that went wrong. Day to
day it is one command:

```bash
pcmax deploy        # pull, build, restart, health-check
pcmax health        # local + public
pcmax backup        # database snapshot
```

## Security posture

- Argon2id passwords, verified in constant time whether or not the account exists
- Rotating refresh sessions in httpOnly cookies; a password reset revokes every one
- Premium features gated **server-side** — the client asks, the server decides, and re-checks on every call
- Package uploads and downloads use short-lived HMAC-signed URLs; the bare object is never public
- Executables and scripts cannot enter a package: one allowlist, enforced on both sides of the wire
- Windows changes are snapshotted before they are applied and roll back on any failure

Full audit: [docs/AUDIT.md](docs/AUDIT.md).

---

<div align="center">
<sub>🇮🇷 <a href="README_FA.md">راهنمای کامل فارسی</a></sub>
</div>
