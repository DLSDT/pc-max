/**
 * Per-game installation directory registry.
 *
 * The optimizer needs to know where each game lives on disk to apply
 * optimization files. Paths are stored locally (never sent to the server) and
 * are resolved against the host filesystem only by the Rust writer in the
 * Tauri shell.
 */
const KEY = 'goh_game_paths_v1';

export function getGamePath(gameSlug: string): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[gameSlug] || null;
  } catch {
    return null;
  }
}

export function setGamePath(gameSlug: string, dir: string): void {
  try {
    const raw = localStorage.getItem(KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const trimmed = dir.trim();
    if (!trimmed) delete map[gameSlug];
    else map[gameSlug] = trimmed;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable — non-fatal.
  }
}
