/**
 * Per-game installation directory registry.
 *
 * The optimizer needs to know where each game lives on disk to apply
 * optimization files. Paths are stored locally (never sent to the server) and
 * are resolved against the host filesystem only by the Rust writer in the
 * Tauri shell.
 */
const KEY = 'goh_game_paths_v1';

/**
 * Read the stored map, treating anything that is not a plain object as empty.
 *
 * Without the shape check a stored `null` made every subsequent write throw,
 * and a stored `"x"` or `42` was worse: assigning a property to a primitive
 * silently does nothing, so the write appeared to succeed and the path was
 * gone on the next read. Either way the user picks a game folder, sees no
 * error, and it never sticks.
 */
function loadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    // Drop any entry that is not a path, rather than handing one to the writer.
    const out: Record<string, string> = {};
    for (const [slug, dir] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof dir === 'string' && dir.trim()) out[slug] = dir;
    }
    return out;
  } catch {
    return {};
  }
}

export function getGamePath(gameSlug: string): string | null {
  return loadMap()[gameSlug] || null;
}

export function setGamePath(gameSlug: string, dir: string): void {
  try {
    const map = loadMap();
    const trimmed = dir.trim();
    if (!trimmed) delete map[gameSlug];
    else map[gameSlug] = trimmed;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable — non-fatal.
  }
}
