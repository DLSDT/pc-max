import { api } from './api';
import { cache } from './cache';
import { ensureDeviceRegistered } from './device';

export interface SyncResult {
  ok: boolean;
  offline: boolean;
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
 * Any network failure marks the app offline; cached data keeps the UI usable.
 */
export async function runSync(): Promise<SyncResult> {
  await ensureDeviceRegistered();
  const lastSync = cache.getLastSync();

  try {
    const [home, manifest] = await Promise.all([api.home(), api.sync(lastSync)]);

    cache.setHome(home);
    cache.upsertGames([...home.popular, ...home.recentlyAdded, ...home.featured]);

    // Remove games that were soft-deleted server-side.
    for (const g of manifest.games) {
      if (g.deleted) cache.removeGame(g.slug);
    }

    // Refresh changed games (fetch full details — also warms the profiles).
    let changedGames = 0;
    const changed = manifest.games.filter((g) => !g.deleted);
    await Promise.all(
      changed.map(async (g) => {
        try {
          const [detail, profiles] = await Promise.all([api.game(g.slug), api.optimizations(g.slug)]);
          cache.setGame(detail);
          cache.setProfiles(g.slug, profiles.data);
          changedGames += 1;
        } catch {
          // The game may have been unpublished — skip it this round.
        }
      }),
    );

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
      changedGames,
      contentUpdatedAt: manifest.contentUpdatedAt,
    };
  } catch {
    return { ok: false, offline: true, changedGames: 0, contentUpdatedAt: null };
  }
}

/** Background sync loop used after the first manual sync. */
export function startBackgroundSync(intervalMs: number, onResult: (r: SyncResult) => void): () => void {
  const id = setInterval(() => {
    void runSync().then(onResult);
  }, intervalMs);
  return () => clearInterval(id);
}
