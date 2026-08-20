import { useSyncExternalStore } from 'react';
import { cache } from '@/lib/cache';

/** Live view of the favorites list (re-renders on any cache mutation). */
export function useFavorites() {
  return useSyncExternalStore(
    (cb) => cache.subscribe(cb),
    () => cache.getFavorites(),
  );
}

export function useIsFavorite(gameId: string) {
  return useSyncExternalStore(
    (cb) => cache.subscribe(cb),
    () => cache.isFavorite(gameId),
  );
}

/** Live view of the recently-viewed games list (re-renders on any cache mutation). */
export function useRecent() {
  return useSyncExternalStore(
    (cb) => cache.subscribe(cb),
    () => cache.getRecent(),
  );
}

/**
 * The full game catalog (all games, not one page) — kept in sync by
 * useInitialSync()'s full/incremental /sync fetches. Use this (not the
 * paginated useGames()) anywhere the whole catalog is needed for local
 * matching, e.g. resolving a detected .exe against every known game.
 */
export function useCatalog() {
  return useSyncExternalStore(
    (cb) => cache.subscribe(cb),
    () => cache.getGames(),
  );
}
