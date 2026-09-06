import { api, isNetworkError, ApiError } from './api';
import { cache } from './cache';
import { ensureDeviceRegistered } from './device';

/**
 * A rate-limited (429) response is transient — the request itself is fine,
 * the server just wants it slower. Retrying (with backoff) is the difference
 * between "this game is missing from the cache until it happens to change
 * again" and a sync that actually finishes complete.
 */
async function withRetry429<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts - 1 || !(err instanceof ApiError) || err.status !== 429) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
}

/**
 * Run `fn` over `items` with at most `limit` in flight at once. A first sync
 * against the full catalog can involve hundreds of "changed" games — firing
 * them all via a single Promise.all blows past the API's per-IP rate limit
 * (300 req/min by default) and the failures are silently swallowed, so the
 * cache never fully warms. This keeps each burst bounded.
 */
async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export interface SyncResult {
  ok: boolean;
  /** No internet connectivity at all. */
  offline: boolean;
  /** Internet works but the PC MAX service is unreachable or errored. */
  apiUnavailable: boolean;
  changedGames: number;
  contentUpdatedAt: string | null;
}

/**
 * One sync pass:
 *  1. register the device (first run),
 *  2. pull /home (hero + popular + recent) into the cache,
 *  3. pull the incremental /sync manifest and refresh changed games,
 *  4. record the new lastSync timestamp.
 *
 * Failures are classified: a network-level failure with no connectivity is
 * "offline"; every other failure (API unreachable, timeout, 5xx) is
 * "api-unavailable". Only the former shows the Offline state — a reachable
 * internet connection with a down service must never be reported as offline.
 */
export async function runSync(onReachable?: () => void): Promise<SyncResult> {
  await ensureDeviceRegistered();
  const lastSync = cache.getLastSync();

  try {
    const [home, manifest] = await Promise.all([api.home(), api.sync(lastSync)]);

    // The server answered, so connectivity is known NOW. Everything below is a
    // background top-up of the offline cache, and the app spent the whole of it
    // reporting "syncing" — on a first run that is hundreds of requests and
    // most of a minute of the badge insisting the app was not online yet.
    onReachable?.();

    cache.setHome(home);
    cache.upsertGames([...home.popular, ...home.recentlyAdded, ...home.featured]);

    // Remove games that were soft-deleted server-side.
    for (const g of manifest.games) {
      if (g.deleted) cache.removeGame(g.slug);
    }

    // Refresh changed games (fetch full details — also warms the profiles).
    // Bounded concurrency: a fresh catalog sync can involve hundreds of
    // games, and firing them all at once trips the API's rate limiter.
    // Only games whose details are ALREADY cached. The manifest lists the whole
    // catalogue on a first sync — every game counts as changed because none is
    // known yet — so this was not refreshing anything, it was downloading 313
    // games' details and profiles before the app would admit to being online.
    // Two requests each, eight at a time, on a link where a round trip is
    // 300ms: twenty seconds at best, minutes with rate-limit backoff, all of it
    // in front of someone who just opened the app.
    //
    // A game nobody has opened does not need its detail prefetched. The page
    // that shows one fetches it, and from then on it refreshes here like any
    // other cached game.
    let changedGames = 0;
    const changed = manifest.games.filter((g) => !g.deleted && cache.getGame(g.slug) !== null);
    await runWithConcurrency(changed, 8, async (g) => {
      try {
        const [detail, profiles] = await Promise.all([
          withRetry429(() => api.game(g.slug)),
          withRetry429(() => api.optimizations(g.slug)),
        ]);
        cache.setGame(detail);
        cache.setProfiles(g.slug, profiles.data);
        changedGames += 1;
      } catch (err) {
        // A real 404 (unpublished mid-sync) is expected and fine to skip;
        // anything else (still-429 after retries, network hiccup) means this
        // game stays stale until the next sync — log it so that's visible
        // instead of silently invisible.
        if (!(err instanceof ApiError) || err.status !== 404) {
          // eslint-disable-next-line no-console
          console.warn(`[sync] failed to refresh ${g.slug}:`, err);
        }
      }
    });

    // New optimization versions are detected by comparing manifest versions
    // against the cached profile versions.
    let newOptimizations = 0;
    for (const p of manifest.profiles) {
      if (p.deleted) continue;
      const known = cache.getProfileVersions(p.gameSlug);
      if (known[p.slug] && known[p.slug] !== p.version) newOptimizations += 1;
    }

    cache.setLastSync(manifest.contentUpdatedAt ?? new Date().toISOString());
    cache.save();

    return {
      ok: true,
      offline: false,
      apiUnavailable: false,
      changedGames,
      contentUpdatedAt: manifest.contentUpdatedAt,
    };
  } catch (err) {
    // Network-level failure while navigator reports no connectivity = genuinely
    // offline. Anything else (API unreachable, timeout, server error) is a
    // service issue — the user's internet may be perfectly fine.
    const offline =
      isNetworkError(err) &&
      typeof navigator !== 'undefined' &&
      navigator.onLine === false;
    return {
      ok: false,
      offline,
      apiUnavailable: !offline,
      changedGames: 0,
      contentUpdatedAt: null,
    };
  }
}

/** Background sync loop used after the first manual sync. */
export function startBackgroundSync(intervalMs: number, onResult: (r: SyncResult) => void): () => void {
  const id = setInterval(() => {
    void runSync().then(onResult);
  }, intervalMs);
  return () => clearInterval(id);
}
