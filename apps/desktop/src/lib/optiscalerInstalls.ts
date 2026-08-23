/**
 * Record of what OptiScaler installed, per game folder.
 *
 * Kept on this machine, like `gamePaths` and the Windows-Optimizer snapshots,
 * because it describes this machine's filesystem: which files were written
 * where, and where their originals were backed up. Uninstall reads it to undo
 * exactly what was done and nothing else, so losing it means the removal can
 * no longer identify PC MAX's own files — which is precisely why removal must
 * never fall back to guessing by filename.
 *
 * Keyed by the resolved game directory rather than the executable: the same
 * game reached through a different launcher shortcut is still one install.
 */
const KEY = 'goh_optiscaler_installs_v1';

export interface OptiScalerInstall {
  gameDir: string;
  launcherDir: string;
  exePath: string;
  /** Which package version produced this install. */
  version: string;
  installer: string | null;
  plan: string | null;
  order: string | null;
  installedAt: string;
  backupDir: string;
  files: { path: string; replaced: boolean }[];
}

type Store = Record<string, OptiScalerInstall>;

/** Read the map, treating anything that is not a plain object as empty. */
function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Drop a malformed entry rather than hand it to the uninstaller. A record
      // with no file list would make removal a no-op that reports success.
      if (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as OptiScalerInstall).gameDir === 'string' &&
        Array.isArray((v as OptiScalerInstall).files)
      ) {
        out[k] = v as OptiScalerInstall;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota or private-mode failure. The install itself already happened; the
    // caller surfaces this so the user knows removal will not be able to
    // identify the files automatically.
    throw new Error('Could not record the installation locally.');
  }
}

export function getInstall(gameDir: string): OptiScalerInstall | null {
  return load()[gameDir] ?? null;
}

export function listInstalls(): OptiScalerInstall[] {
  return Object.values(load()).sort((a, b) => b.installedAt.localeCompare(a.installedAt));
}

export function recordInstall(entry: OptiScalerInstall): void {
  const store = load();
  store[entry.gameDir] = entry;
  save(store);
}

export function clearInstall(gameDir: string): void {
  const store = load();
  delete store[gameDir];
  save(store);
}
