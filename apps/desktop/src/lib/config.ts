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
  return 'https://pcmax-api.rixy.ir/api/v1';
}

export const config = {
  apiUrl: resolveApiUrl(),
  /** Build-time fallback only — see getRuntimeAppVersion() for the real, packaged version. */
  appVersion: '0.4.0',
  syncIntervalMs: 5 * 60 * 1000,
  /** Default timeout for API requests (network flakiness must not hang the UI). */
  requestTimeoutMs: 15 * 1000,
} as const;

let cachedRuntimeVersion: string | null = null;

/**
 * The actual running app version. Reads it from the packaged Tauri binary
 * itself (Cargo.toml's CARGO_PKG_VERSION, via the `app_version` command) so
 * the update-check/About-screen version can never silently drift from what's
 * really installed — falls back to the static `config.appVersion` constant
 * only in the browser preview, where there is no packaged binary to ask.
 */
export async function getRuntimeAppVersion(): Promise<string> {
  if (cachedRuntimeVersion) return cachedRuntimeVersion;
  if (typeof window !== 'undefined' && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      cachedRuntimeVersion = await invoke<string>('app_version');
      return cachedRuntimeVersion;
    } catch {
      // fall through to the static fallback
    }
  }
  cachedRuntimeVersion = config.appVersion;
  return cachedRuntimeVersion;
}
