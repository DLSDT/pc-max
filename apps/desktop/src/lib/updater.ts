/**
 * Auto-update (Phase 17).
 *
 * Two layers:
 *  - The release manifest check (API) surfaces "update available" + whether the
 *    running version is below the server's mandatory minimum (`/config` →
 *    min_app_version). The minimum is enforced in the UI with a blocking banner.
 *  - Inside the Tauri shell the native updater plugin performs the actual
 *    download + install. It requires the signing keypair (see tauri.conf.json →
 *    plugins.updater.pubkey); until the public key is set, `check()` is a
 *    graceful no-op.
 */

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriShell(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

/** Compare semver strings: 1 if a>b, -1 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  version?: string;
  /** Running version is below the server-mandated minimum. */
  required: boolean;
}

export async function checkNativeUpdate(): Promise<UpdateCheckResult> {
  if (!isTauriShell()) return { hasUpdate: false, required: false };
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    return { hasUpdate: Boolean(update), version: update?.version, required: false };
  } catch {
    return { hasUpdate: false, required: false };
  }
}

/** Download + install the pending native update (Tauri shell only). */
export async function installNativeUpdate(): Promise<boolean> {
  if (!isTauriShell()) return false;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return false;
    await update.downloadAndInstall();
    return true;
  } catch {
    return false;
  }
}
