/**
 * Where the rate limiter keeps its counters.
 *
 * In memory, each API process has its own tally. That is wrong in two
 * directions at once: run three replicas and the effective ceiling is three
 * times what was configured, and a restart hands every caller a clean slate.
 * Redis makes the limit mean one thing no matter how many processes are
 * serving.
 *
 * Optional on purpose. Without REDIS_URL the limiter falls back to per-process
 * memory, which is the right behaviour for a single container and for tests —
 * a missing cache should never stop the API from booting.
 */
import { config } from '../config';

export async function createRateLimitStore(): Promise<unknown | null> {
  if (!config.REDIS_URL) return null;
  try {
    const { default: IORedis } = await import('ioredis');
    // The limiter runs on the hot path for every request, so it must never
    // queue behind a dead Redis: fail open to memory rather than hold requests.
    const client = new IORedis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
    await client.connect();
    // eslint-disable-next-line no-console
    console.log('🚦 Rate limiter sharing counters via Redis');
    return client;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`⚠️  Rate limiter falling back to per-process counters: ${(err as Error).message}`);
    return null;
  }
}
