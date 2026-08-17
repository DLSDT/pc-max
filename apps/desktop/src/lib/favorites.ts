import type { GameSummary } from '@goh/types';
import { api } from '@/lib/api';
import { cache } from '@/lib/cache';

// Lazy import to avoid a store <-> lib import cycle (only used at runtime).
async function currentUser() {
  const { useAuth } = await import('@/store/auth');
  return useAuth.getState().user;
}

/**
 * Favorites — persistent and user-specific.
 *
 * The local cache (localStorage) stays the live source for the UI (instant
 * updates + offline), and the server becomes the source of truth once the user
 * is signed in: `syncFavoritesFromServer` merges local favorites up to the
 * account on login/restore, then replaces the cache with the server list.
 */
export async function syncFavoritesFromServer(): Promise<void> {
  const user = await currentUser();
  if (!user) return;

  // Push any offline-only favorites to the account (idempotent PUT).
  for (const game of cache.getFavorites()) {
    try {
      await api.addFavorite(game.id);
    } catch {
      // A failed push is non-fatal; the server list below is still applied.
    }
  }

  const res = await api.getFavorites();
  cache.setFavorites(res.data);
}

/** Optimistic add/remove with rollback on API failure (only when signed in). */
export async function toggleFavorite(game: GameSummary): Promise<boolean> {
  const isNowFavorite = cache.isFavorite(game.id);
  const user = await currentUser();
  if (!user) {
    // Anonymous: local-only persistence (works offline, kept across restarts).
    if (isNowFavorite) cache.removeFavorite(game.id);
    else cache.addFavorite(game);
    return !isNowFavorite;
  }

  const next = !isNowFavorite;
  if (next) cache.addFavorite(game);
  else cache.removeFavorite(game.id);

  try {
    if (next) await api.addFavorite(game.id);
    else await api.removeFavorite(game.id);
    return next;
  } catch {
    // Rollback to the previous state.
    if (next) cache.removeFavorite(game.id);
    else cache.addFavorite(game);
    throw new Error('Could not update favorites — please try again');
  }
}
