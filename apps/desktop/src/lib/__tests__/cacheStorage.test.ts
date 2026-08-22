import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * The cache holds the whole offline catalogue, so a corrupt entry that throws
 * on read would leave the app with nothing to show while offline — the one
 * situation the cache exists for.
 */
const KEY = 'goh_cache_v1';

function memoryStorage() {
  let data: Record<string, string> = {};
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {
      data = {};
    },
  };
}

describe('cache storage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(9) });
  });

  it('recovers from every corrupt shape instead of throwing on read', async () => {
    for (const corrupt of [
      '{"games":null}',
      '{"gamesOrder":null}',
      '{"favorites":null}',
      '{"gamesList":null}',
      '{"details":null}',
      '{"gamesOrder":{}}',
      '"a string"',
      '42',
      'null',
      '[]',
      'not json',
    ]) {
      vi.resetModules();
      localStorage.setItem(KEY, corrupt);
      const { cache } = await import('../cache');
      expect(() => cache.getGames(), `getGames on ${corrupt}`).not.toThrow();
      expect(() => cache.getFavorites(), `getFavorites on ${corrupt}`).not.toThrow();
      expect(Array.isArray(cache.getGames()), `getGames must stay an array on ${corrupt}`).toBe(true);
      expect(Array.isArray(cache.getFavorites()), `getFavorites must stay an array on ${corrupt}`).toBe(true);
    }
  });

  it('returns a reference-stable games array', async () => {
    const { cache } = await import('../cache');
    // useSyncExternalStore compares snapshots by identity; a fresh array each
    // call is an infinite render loop, which is how the Library page once
    // crashed with "getSnapshot, hook is null".
    expect(cache.getGames()).toBe(cache.getGames());
  });
});
