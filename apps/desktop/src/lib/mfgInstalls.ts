/**
 * Record of what a Multi-Frame Generation tool installed, per game folder.
 *
 * One store for all three tools rather than one per tool: removal reads it to
 * undo exactly what was written and nothing else, and duplicating that would
 * mean duplicating the only thing standing between "remove OptiScaler" and
 * deleting a file the user put there themselves.
 *
 * Kept on this machine, like `gamePaths` and the Windows-Optimizer snapshots,
 * because it describes this machine's filesystem: which files were written
 * where, and where their originals were backed up. Losing it means removal can
 * no longer identify PC MAX's own files — which is exactly why removal never
 * falls back to guessing by filename.
 *
 * Keyed by tool + resolved game directory: the same game reached through a
 * different shortcut is one install, and two tools in one game are two records.
 */
import type { MfgTool } from '@goh/types';

const KEY = 'goh_mfg_installs_v1';
/** Pre-generalisation key, read once so an existing OptiScaler install is not orphaned. */
const LEGACY_OPTISCALER_KEY = 'goh_optiscaler_installs_v1';

export interface MfgInstall {
  tool: MfgTool;
  gameDir: string;
  launcherDir: string;
  exePath: string;
  /** Package version this install came from. */
  version: string;
  /** What was chosen, by component name — e.g. { installer, plan, order } or
   *  { unlocker, streamline }. Rendered back to the user as "what is installed". */
  selection: Record<string, string | null>;
  installedAt: string;
  backupDir: string;
  files: { path: string; replaced: boolean }[];
}

type Store = Record<string, MfgInstall>;

const idOf = (tool: MfgTool, gameDir: string) => `${tool}::${gameDir}`;

/** A record with no file list would make removal a no-op that reports success. */
function usable(v: unknown): v is MfgInstall {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as MfgInstall).gameDir === 'string' &&
    Array.isArray((v as MfgInstall).files)
  );
}

function readKey(key: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function load(): Store {
  const out: Store = {};

  // Legacy first, so a re-recorded install under the new key wins.
  for (const [gameDir, v] of Object.entries(readKey(LEGACY_OPTISCALER_KEY))) {
    if (!usable(v)) continue;
    const legacy = v as MfgInstall & { installer?: string | null; plan?: string | null; order?: string | null };
    out[idOf('optiscaler', gameDir)] = {
      ...legacy,
      tool: 'optiscaler',
      selection: legacy.selection ?? {
        installer: legacy.installer ?? null,
        plan: legacy.plan ?? null,
        order: legacy.order ?? null,
      },
    };
  }

  for (const [id, v] of Object.entries(readKey(KEY))) {
    if (usable(v)) out[id] = v;
  }
  return out;
}

function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota or private-mode failure. The install already happened, so the
    // caller surfaces this: removal will not be able to identify the files.
    throw new Error('Could not record the installation locally.');
  }
}

export function getInstall(tool: MfgTool, gameDir: string): MfgInstall | null {
  return load()[idOf(tool, gameDir)] ?? null;
}

export function listInstalls(tool?: MfgTool): MfgInstall[] {
  return Object.values(load())
    .filter((i) => !tool || i.tool === tool)
    .sort((a, b) => b.installedAt.localeCompare(a.installedAt));
}

export function recordInstall(entry: MfgInstall): void {
  const store = load();
  store[idOf(entry.tool, entry.gameDir)] = entry;
  save(store);
}

export function clearInstall(tool: MfgTool, gameDir: string): void {
  const store = load();
  delete store[idOf(tool, gameDir)];
  save(store);
  // Also drop the legacy entry, or it would reappear on the next read.
  if (tool === 'optiscaler') {
    const legacy = readKey(LEGACY_OPTISCALER_KEY);
    if (gameDir in legacy) {
      delete legacy[gameDir];
      try {
        localStorage.setItem(LEGACY_OPTISCALER_KEY, JSON.stringify(legacy));
      } catch {
        /* the new-key delete above is what matters */
      }
    }
  }
}
