import { config, getRuntimeAppVersion } from './config';
import { cache } from './cache';
import { isTauriShell } from './optimizer';

/**
 * Anonymous crash reporting to our own API (no third-party service).
 *
 * Reporting must never make things worse: every failure here is swallowed,
 * the same crash is only sent once per session, and the payload carries no
 * user identity — just the client-generated install id already used for
 * analytics.
 */

/** Fingerprints already reported this session — avoids flooding on a loop. */
const reported = new Set<string>();
const MAX_PER_SESSION = 20;

export type CrashSource = 'render' | 'window' | 'promise';

function currentRoute(): string {
  // HashRouter — the hash IS the route. Strip any query string.
  const hash = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
  return (hash.split('?')[0] || '/').slice(0, 300);
}

export async function reportCrash(error: unknown, source: CrashSource = 'render'): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const message = (err.message || 'Unknown error').slice(0, 1000);
    const stack = (err.stack ?? '').slice(0, 8000);
    const route = currentRoute();

    // Local de-dupe so a render loop doesn't spam the endpoint.
    const key = `${message}|${route}`;
    if (reported.has(key) || reported.size >= MAX_PER_SESSION) return;
    reported.add(key);

    const appVersion = await getRuntimeAppVersion().catch(() => config.appVersion);

    await fetch(`${config.apiUrl}/client-errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message,
        stack: stack || undefined,
        route,
        appVersion,
        platform: isTauriShell() ? 'desktop' : 'browser',
        deviceId: cache.getDeviceId(),
        source,
      }),
      // Never let a hanging report keep the app busy.
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Reporting is best-effort by design — a failure here must stay invisible.
  }
}

/** Attach global handlers for errors React's boundary cannot catch. */
export function installGlobalCrashHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    void reportCrash(event.error ?? event.message, 'window');
  });

  window.addEventListener('unhandledrejection', (event) => {
    void reportCrash(event.reason, 'promise');
  });
}
