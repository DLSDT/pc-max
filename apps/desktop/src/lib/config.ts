/**
 * Runtime configuration for the desktop app.
 *
 * The API base URL is injected at build time via VITE_API_URL. No secrets ever
 * live in the desktop bundle — it only talks to the public, anonymous API.
 *
 * Resolution order:
 *   1. VITE_API_URL (build-time, e.g. the CI workflow passes the deployed API)
 *   2. dev fallback  — local API (Vite dev / `tauri:dev` on a dev machine)
 *   3. prod fallback — the public PC MAX API domain
 *
 * The production fallback is critical: an installed build must never default
 * to `localhost`, or every API-dependent feature (login, catalog, sync) fails
 * and the app falsely reports "offline" on user machines.
 */
function resolveApiUrl(): string {
  const injected = import.meta.env.VITE_API_URL as string | undefined;
  if (injected) return injected.replace(/\/+$/, '');
  if (import.meta.env.DEV) return 'http://localhost:4000/api/v1';
  return 'https://api.pcmax.app/api/v1';
}

export const config = {
  apiUrl: resolveApiUrl(),
  appVersion: '0.3.1',
  syncIntervalMs: 5 * 60 * 1000,
  /** Default timeout for API requests (network flakiness must not hang the UI). */
  requestTimeoutMs: 15 * 1000,
} as const;
