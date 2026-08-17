# Load Testing (Phase 20) — k6

Load tests for the Game Optimization Hub API with the three audit targets:
**1,000 / 10,000 / 100,000 concurrent readers**.

## Install k6

```bash
# Linux (deb/rpm) — official binary
curl -L https://github.com/grafana/k6/releases/latest/download/k6-linux-amd64.tar.gz | tar -xz
sudo mv k6-* /usr/local/bin/k6

# Windows (scoop)
scoop install k6

# macOS (Homebrew)
brew install k6
```

## Quick start (smoke)

```bash
# Point at a running API (default http://localhost:4000)
k6 run infrastructure/k6/load-test.js
```

## The three audit targets

| Target | Command |
|---|---|
| 1k readers | `USERS=1000 RAMP=30s RUN=3m k6 run infrastructure/k6/load-test.js` |
| 10k readers | `USERS=10000 RAMP=60s RUN=5m k6 run infrastructure/k6/load-test.js` |
| 100k readers | `USERS=100000 RAMP=120s RUN=10m k6 run infrastructure/k6/load-test.js` |

The 100k run requires a production-grade host: the docker-compose stack
(API + Redis + PostgreSQL), several API replicas behind a load balancer, and
k6 running on a separate machine (100k VUs saturate one box's sockets).

## What it exercises

- **Public cache-first reads** (the desktop startup/sync path): `/home/cached`,
  `/games/cached`, `/subscriptions/plans`, `/config` — all TTL-cached with
  `Cache-Control`, so they should never hit PostgreSQL at scale.
- **Uncached reads**: `/games/:slug` (game detail — DB-backed, p95 budget 500ms).
- **Authenticated flow** (every 10th VU): register/login → `/me/subscription` →
  `/me/devices` → `/sync` — exercises Argon2id, JWT, sessions and the heaviest
  DB read path, keeping accounts below the 5-attempt lockout.

## Thresholds (fail = CI red)

- `http_req_failed < 1%` — error rate
- `http_req_duration p(95) < 500ms` — overall
- `home` / `plans` p(95) `< 300ms` — cached endpoints

## Reading results

- **`http_req_duration`** — latency; watch `p(95)` vs the thresholds.
- **`http_reqs`** — throughput (req/s); the cached endpoints should dominate.
- **`vus`** — ramp health; a plateau below `USERS` means connection exhaustion
  (raise `gracefulRampDown`, increase the k6 machine's file limits, or scale
  the API horizontally).
- **`http_req_blocked`** — if it grows during the run, the API has no free
  sockets: add replicas.

## Notes

- Run against `NODE_ENV=production` (docker-compose) for meaningful numbers —
  dev mode lacks the production JWT/download secret guards and serves slower
  logging.
- Accounts persist between runs (register falls back to login), so re-runs are
  safe against the unique-email constraint and the lockout counter.
- k6 is intentionally NOT a devDependency — it's a standalone binary; the
  script lives in the repo so CI can run it with `docker run grafana/k6 ...`.
