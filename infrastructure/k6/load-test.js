// Game Optimization Hub — k6 load test (Phase 20)
//
// Usage:
//   k6 run infrastructure/k6/load-test.js
//   BASE_URL=http://localhost:4000 k6 run infrastructure/k6/load-test.js
//
// The scenario is driven entirely by environment variables so the same script
// serves the three audit targets:
//   USERS=1000  RAMP=30s  RUN=3m   → 1k concurrent readers
//   USERS=10000 RAMP=60s  RUN=5m   → 10k concurrent readers
//   USERS=100000 RAMP=120s RUN=10m → 100k concurrent readers (requires a
//                                     production-grade host + Redis)
//
// Every virtual user mixes public reads (home/games/plans/config) with the
// authenticated flow (register/login/me/subscription) so the DB + auth paths
// are exercised, not just the CDN-able cache.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomItem } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const USERS = Number(__ENV.USERS || 1000);
const RAMP = __ENV.RAMP || '30s';
const RUN = __ENV.RUN || '3m';
const MAX_FAILED_LOGINS = 5; // account lockout kicks in past this — keep VUs under it

// Seeded game slugs (from the dev/seed DB). Missing ones 404 harmlessly, but
// the seeded set keeps the test realistic.
const GAME_SLUGS = ['doom', 'gta-v', 'elden-ring', 'red-dead-redemption-2', 'call-of-duty-modern-warfare-ii', 'deathloop', 'dying-light', 'star-wars-outlaws'];

export const options = {
  scenarios: {
    readers: {
      executor: 'ramping-vus',
      stages: [
        { target: USERS, duration: RAMP },
        { target: USERS, duration: RUN },
        { target: 0, duration: '30s' },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // <1% errors
    http_req_duration: ['p(95)<500'], // p95 under 500ms for cached reads
    'http_req_duration{name:home}': ['p(95)<300'],
    'http_req_duration{name:plans}': ['p(95)<300'],
  },
};

function registerUser(vu) {
  const email = `k6.user.${vu}@load.local`;
  const res = http.post(
    `${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({ email, username: `k6user${vu}`, password: 'K6Pass123!' }),
    { headers: { 'content-type': 'application/json' } },
  );
  if (res.status === 201) return res.json().accessToken;
  // Account already exists from a previous run — log in instead.
  const login = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password: 'K6Pass123!' }),
    { headers: { 'content-type': 'application/json' } },
  );
  return login.status === 200 ? login.json().accessToken : null;
}

export default function () {
  const vu = __VU;

  // Public cache-first reads — the path the desktop app hits on sync/startup.
  check(http.get(`${BASE_URL}/api/v1/home/cached`, { tags: { name: 'home' } }), {
    'home 200': (r) => r.status === 200,
  });
  check(http.get(`${BASE_URL}/api/v1/games/cached`, { tags: { name: 'games' } }), {
    'games 200': (r) => r.status === 200,
  });
  check(http.get(`${BASE_URL}/api/v1/subscriptions/plans`, { tags: { name: 'plans' } }), {
    'plans 200': (r) => r.status === 200,
  });
  check(http.get(`${BASE_URL}/api/v1/config`, { tags: { name: 'config' } }), {
    'config 200': (r) => r.status === 200,
  });
  check(http.get(`${BASE_URL}/api/v1/games/${randomItem(GAME_SLUGS)}`, { tags: { name: 'game-detail' } }), {
    'game-detail 200': (r) => r.status === 200,
  });

  // Authenticated flow — a subset of VUs (every 10th) exercises auth+DB so
  // the total stays far below the 5-attempt lockout per account.
  if (vu % 10 === 0) {
    const token = registerUser(vu);
    if (token) {
      const headers = { authorization: `Bearer ${token}` };
      check(http.get(`${BASE_URL}/api/v1/me/subscription`, { headers, tags: { name: 'me-subscription' } }), {
        'me-subscription 200': (r) => r.status === 200,
      });
      check(http.get(`${BASE_URL}/api/v1/me/devices`, { headers, tags: { name: 'me-devices' } }), {
        'me-devices 200': (r) => r.status === 200,
      });
      // Sync (incremental manifest) is the heaviest read path the desktop uses.
      check(http.get(`${BASE_URL}/api/v1/sync`, { headers, tags: { name: 'sync' } }), {
        'sync 200': (r) => r.status === 200,
      });
    }
  }

  sleep(1); // ~1 request/s per VU — bounded realism
}
