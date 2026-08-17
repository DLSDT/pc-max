import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSummary } from '@goh/types';

/**
 * Regression test for the FavoritesPage crash:
 * `cache.getFavorites()` used to return a fresh `Object.values(...)` array on
 * every call. useSyncExternalStore requires a CACHED snapshot — a new
 * reference each render caused an infinite loop ("getSnapshot should be
 * cached") that crashed the Favorites page.
 *
 * The cache module reads/writes localStorage at import time, so stub the
 * globals BEFORE importing it.
 */
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
});
vi.stubGlobal('crypto', {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i += 1) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  },
});

const { cache } = await import('../cache');

describe('cache favorites snapshots', () => {
  beforeEach(() => {
    cache.clear();
  });

  function game(id: string, slug: string): GameSummary {
    return { id, slug, name: slug } as GameSummary;
  }

  it('returns a reference-stable favorites array between mutations', () => {
    const first = cache.getFavorites();
    // Stable across reads — safe to hand to useSyncExternalStore.
    expect(cache.getFavorites()).toBe(first);
  });

  it('changes the snapshot reference only when favorites change', () => {
    const before = cache.getFavorites();

    cache.addFavorite(game('g1', 'alpha'));
    const afterAdd = cache.getFavorites();
    expect(afterAdd).not.toBe(before);
    expect(afterAdd).toHaveLength(1);
    // Stable again once the mutation settles.
    expect(cache.getFavorites()).toBe(afterAdd);

    cache.removeFavorite('g1');
    const afterRemove = cache.getFavorites();
    expect(afterRemove).not.toBe(afterAdd);
    expect(afterRemove).toHaveLength(0);
    expect(cache.getFavorites()).toBe(afterRemove);
  });

  it('persists favorites across a reload (offline-first behavior)', () => {
    cache.addFavorite(game('g1', 'alpha'));
    // Simulate a full app restart by re-running load() from the same store.
    cache.load();
    expect(cache.isFavorite('g1')).toBe(true);
    expect(cache.getFavorites()).toHaveLength(1);
  });
});
