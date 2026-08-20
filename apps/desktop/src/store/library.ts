import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The user's game library — every game PC MAX knows about on this machine.
 *
 * Entries come from two sources, both stored locally (paths never leave the
 * device):
 *   - `manual`: the user explicitly selected an installation directory.
 *   - `detected`: the generic detection pass found a known executable on disk.
 *
 * A path that could not be matched to a catalog game is kept as an "unknown"
 * entry so the user can associate it manually.
 */
export interface LibraryGame {
  /** Catalog slug ('' for unknown games). */
  slug: string;
  /** Display name — catalog name or the folder name for unknown games. */
  name: string;
  /** Absolute installation directory. */
  path: string;
  /** Matched executable file name (detected entries). */
  executable?: string;
  /** Icon extracted from the .exe itself (data URL), for games with no catalog artwork. */
  iconDataUrl?: string;
  source: 'manual' | 'detected';
  /** True when the path could not be matched to any supported game. */
  unknown: boolean;
  addedAt: string;
}

interface LibraryState {
  games: Record<string, LibraryGame>;
  addManual: (entry: Omit<LibraryGame, 'source' | 'addedAt'>) => void;
  addDetected: (entries: Omit<LibraryGame, 'addedAt'>[]) => void;
  updateSlug: (path: string, slug: string, name: string) => void;
  remove: (path: string) => void;
  clear: () => void;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      games: {},

      addManual: (entry) =>
        set((s) => ({
          games: {
            ...s.games,
            [entry.path]: { ...entry, source: 'manual', addedAt: new Date().toISOString() },
          },
        })),

      addDetected: (entries) =>
        set((s) => {
          const next = { ...s.games };
          for (const e of entries) next[e.path] = { ...e, addedAt: new Date().toISOString() };
          return { games: next };
        }),

      updateSlug: (path, slug, name) =>
        set((s) => {
          const cur = s.games[path];
          if (!cur) return s;
          return { games: { ...s.games, [path]: { ...cur, slug, name, unknown: !slug } } };
        }),

      remove: (path) =>
        set((s) => {
          const next = { ...s.games };
          delete next[path];
          return { games: next };
        }),

      clear: () => set({ games: {} }),
    }),
    { name: 'goh_library_v1' },
  ),
);

/** The catalog games the user has in their library (matched entries). */
export function libraryCatalogSlugs(games: Record<string, LibraryGame>): string[] {
  return Object.values(games)
    .filter((g) => !g.unknown && g.slug)
    .map((g) => g.slug);
}
