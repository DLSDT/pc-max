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
