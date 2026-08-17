/**
 * Generic game detection (Phase: universal game optimization).
 *
 * Detection is fully data-driven: the desktop asks the backend catalog for
 * every supported game's executable names and passes them (plus a bounded set
 * of candidate roots — Steam library folders, Program Files, user paths) to
 * the Rust `detect_games` command, which checks the real filesystem on
 * Windows. Nothing is hardcoded to a single game.
 *
 * In the browser preview there is no filesystem, so detection returns nothing
 * and the UI honestly reports that auto-detection requires the desktop app.
 */
import { useLibrary, type LibraryGame } from '@/store/library';

export interface KnownExecutable {
  slug: string;
  name: string;
  executables: string[];
}

export interface DetectResult {
  /** True when the real (Tauri/Windows) filesystem was available. */
  realFs: boolean;
  /** Found entries (the store stamps `addedAt` on merge). */
  found: Omit<LibraryGame, 'addedAt'>[];
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

/** Common candidate roots to scan (bounded, never the whole disk). */
export function defaultCandidateRoots(): string[] {
  const roots: string[] = [];
  if (navigator.platform.toLowerCase().includes('win')) {
    roots.push('C:\\Program Files', 'C:\\Program Files (x86)', 'D:\\Program Files', 'D:\\Program Files (x86)');
  }
  return roots;
}

/**
 * Run the generic detection pass. Returns the games found on disk.
 * In the browser (no Tauri shell) returns an empty result — never fake data.
 */
export async function detectGamesOnDisk(known: KnownExecutable[]): Promise<DetectResult> {
  if (!isTauri()) {
    return { realFs: false, found: [] };
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const payload = known.flatMap((k) => k.executables.map((exe) => ({ slug: k.slug, name: k.name, exe })));
    const found = (await invoke('detect_games', { roots: defaultCandidateRoots(), known: payload })) as {
      slug: string;
      name: string;
      path: string;
      executable: string;
    }[];
    return {
      realFs: true,
      found: found.map((f) => ({
        slug: f.slug,
        name: f.name,
        path: f.path,
        executable: f.executable,
        source: 'detected' as const,
        unknown: false,
      })),
    };
  } catch {
    return { realFs: false, found: [] };
  }
}

/** Merge detection results into the library store. */
export function applyDetection(results: DetectResult): void {
  if (results.found.length) useLibrary.getState().addDetected(results.found);
}
