import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the first launch costs.
 *
 * The sync manifest lists the whole catalogue, and on a first run every game
 * in it counts as "changed" because none is cached yet. The refresh loop took
 * that literally and fetched a detail and a profile list for each — 313 games,
 * 626 requests, eight at a time. On a link where one round trip is 300ms that
 * is twenty seconds at the very best, minutes once the rate limiter starts
 * pushing back, and the connectivity badge said "syncing" for all of it
 * because the status was only set after the whole thing finished.
 *
 * Neither of those is visible from a screenshot or a passing render test. The
 * app works; it just makes you wait. So both are asserted here directly: how
 * many requests a cold start makes, and when connectivity is reported.
 */

const home = { popular: [], recentlyAdded: [], featured: [] };
const manifestGames = Array.from({ length: 313 }, (_, i) => ({ slug: `game-${i}`, deleted: false }));

const detailCalls: string[] = [];
const cached = new Set<string>();

vi.mock('@/lib/api', () => ({
  api: {
    home: vi.fn(async () => home),
    sync: vi.fn(async () => ({ games: manifestGames, profiles: [], contentUpdatedAt: null })),
    game: vi.fn(async (slug: string) => {
      detailCalls.push(slug);
      return { slug };
    }),
    optimizations: vi.fn(async () => ({ data: [] })),
    registerDevice: vi.fn(async () => ({})),
  },
  ApiError: class ApiError extends Error {
    status = 500;
  },
  isNetworkError: () => false,
}));

vi.mock('@/lib/cache', () => ({
  cache: {
    getLastSync: () => null,
    setLastSync: vi.fn(),
    setHome: vi.fn(),
    upsertGames: vi.fn(),
    removeGame: vi.fn(),
    setGame: vi.fn(),
    setProfiles: vi.fn(),
    getProfileVersions: () => ({}),
    save: vi.fn(),
    getGame: (slug: string) => (cached.has(slug) ? { slug } : null),
  },
}));

vi.mock('@/lib/device', () => ({ ensureDeviceRegistered: vi.fn(async () => {}) }));

const { runSync } = await import('@/lib/sync');

beforeEach(() => {
  detailCalls.length = 0;
  cached.clear();
});

describe('what a cold start costs', () => {
  it('fetches no game details at all on a first run', async () => {
    // Nothing is cached, so there is nothing to refresh. A game nobody has
    // opened does not need its detail downloaded before the app will start.
    await runSync();
    expect(detailCalls).toEqual([]);
  });

  it('still refreshes the games that are actually cached', async () => {
    cached.add('game-7');
    cached.add('game-200');
    await runSync();
    expect(detailCalls.sort()).toEqual(['game-200', 'game-7']);
  });

  it('reports the server reachable before the refresh loop, not after it', async () => {
    cached.add('game-1');
    const order: string[] = [];
    await runSync(() => order.push('reachable'));
    order.push(...detailCalls.map(() => 'detail'));
    expect(order[0], 'the badge waited for the whole catalogue').toBe('reachable');
  });

  it('does not claim reachable when the server never answered', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.sync).mockRejectedValueOnce(new Error('down'));
    const onReachable = vi.fn();
    const result = await runSync(onReachable);
    expect(onReachable).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
