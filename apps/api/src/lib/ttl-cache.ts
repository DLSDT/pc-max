import { config } from '../config';

/**
 * TTL cache for hot public reads (Phase 16).
 *
 * Two layers: a small in-process map (zero-latency, consistent within one
 * instance) and, when `REDIS_URL` is configured, a shared Redis layer so
 * multiple API instances stay coherent. Any Redis failure degrades gracefully
 * to the memory layer — caching must never take the API down.
 *
 * Cache keys for a given resource must be deterministic; entries are stored
 * as JSON and validated by the route's response schema on the way out.
 */

type Backend = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(prefix: string): Promise<void>;
};

class MemoryBackend implements Backend {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

let redisBackend: Backend | null | undefined;

async function redis(): Promise<Backend | null> {
  if (redisBackend !== undefined) return redisBackend;
  if (!config.REDIS_URL) {
    redisBackend = null;
    return null;
  }
  try {
    const { default: IORedis } = await import('ioredis');
    const client = new IORedis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    await client.connect();
    redisBackend = {
      get: (key) => client.get(key),
      set: async (key, value, ttlSeconds) => {
        await client.set(key, value, 'EX', ttlSeconds);
      },
      del: async (prefix) => {
        const keys = await client.keys(`${prefix}*`);
        if (keys.length) await client.del(...keys);
      },
    };
    // eslint-disable-next-line no-console
    console.log(`🗄️  Redis cache connected (${config.REDIS_URL})`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`⚠️  Redis unavailable — falling back to in-memory cache: ${(err as Error).message}`);
    redisBackend = null;
  }
  return redisBackend ?? null;
}

export class TtlCache {
  private memory = new MemoryBackend();

  constructor(private readonly defaultTtlSeconds: number) {}

  async get<T>(key: string, loader: () => Promise<T>, ttlSeconds = this.defaultTtlSeconds): Promise<T> {
    const backend = await redis();
    const active = backend ?? this.memory;

    const hit = await active.get(key);
    if (hit !== null) {
      try {
        return JSON.parse(hit) as T;
      } catch {
        // Corrupt entry — fall through and reload.
      }
    }

    const value = await loader();
    try {
      await active.set(key, JSON.stringify(value), ttlSeconds);
    } catch {
      // Cache write failure is non-fatal.
    }
    return value;
  }

  /** Drop cached entries under a prefix (e.g. after admin edits). */
  async invalidate(prefix: string): Promise<void> {
    const backend = await redis();
    const active = backend ?? this.memory;
    try {
      await active.del(prefix);
    } catch {
      // Non-fatal.
    }
  }
}

/** Short-lived public catalog data (games, home). */
export const catalogCache = new TtlCache(config.CATALOG_CACHE_TTL);

/** Semi-static platform data (plans, remote config). */
export const configCache = new TtlCache(config.CONFIG_CACHE_TTL);
