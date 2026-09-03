/**
 * Verification mail, taken off the request.
 *
 * Registration used to wait for a real SMTP round trip before answering — up
 * to the 15-second transport timeout, inside the request the user is staring
 * at. One signup at a time that is merely slow. Ten thousand at once and every
 * one of those requests is parked on the mail provider while the database and
 * the CPU sit idle, and the provider's own hourly cap is reached long before
 * the API is troubled. The queue is what stops a launch from looking like an
 * outage.
 *
 * Durability is deliberately modest: a Redis list, one worker per API process,
 * a few retries with backoff. Not a job framework — a job framework is a thing
 * to operate, and the payload here is a six-digit code that expires in minutes.
 * A code lost to a crash is a code the user asks for again.
 *
 * Without REDIS_URL there is no queue and delivery stays inline, exactly as it
 * was. That keeps single-container deployments and the whole test suite on the
 * old path rather than making a cache a hard dependency of signing up.
 */
import { config } from '../config';
import { discardOtp } from './otp';
import type { OtpPurpose } from './otp';

export interface OtpMailJob {
  identifier: string;
  code: string;
  purpose: OtpPurpose;
  resetLink?: string;
  /** Retries used so far. */
  attempt?: number;
}

/** Returns whether the mail actually went out. */
type Deliverer = (job: OtpMailJob) => Promise<boolean>;

const KEY = 'goh:mail:otp';
const MAX_ATTEMPTS = 4;
/** 0s, 2s, 8s, 32s — long enough to outlast a provider hiccup, short enough
 *  to stay inside the code's own lifetime. */
const backoffMs = (attempt: number) => (attempt === 0 ? 0 : 2000 * 4 ** (attempt - 1));

let deliverer: Deliverer | null = null;

/**
 * The delivery function is injected rather than imported: the templates live
 * with the auth routes, and importing them here would close a cycle.
 */
export function setOtpDeliverer(fn: Deliverer): void {
  deliverer = fn;
}

type Client = {
  lpush(key: string, value: string): Promise<number>;
  brpop(key: string, timeout: number): Promise<[string, string] | null>;
  quit(): Promise<unknown>;
};

let clientPromise: Promise<Client | null> | undefined;

async function connect(): Promise<Client | null> {
  if (!config.REDIS_URL) return null;
  try {
    const { default: IORedis } = await import('ioredis');
    // A blocking BRPOP holds the connection, so the worker gets its own rather
    // than stalling every other Redis user in the process.
    const client = new IORedis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
    await client.connect();
    return client as unknown as Client;
  } catch {
    return null;
  }
}

function client(): Promise<Client | null> {
  clientPromise ??= connect();
  return clientPromise;
}

async function deliver(job: OtpMailJob): Promise<boolean> {
  if (!deliverer) throw new Error('mail queue used before setOtpDeliverer');
  return deliverer(job);
}

/**
 * Hand a code to the mailer.
 *
 * With a queue this returns as soon as the job is stored, and `delivered` is
 * undefined because nothing has been attempted yet. Without one it delivers
 * inline and reports the outcome, which is what the caller turns into the
 * "could not send" error.
 */
export async function enqueueOtpMail(job: OtpMailJob): Promise<{ queued: boolean; delivered?: boolean }> {
  const c = await client();
  if (!c) return { queued: false, delivered: await deliver(job) };
  try {
    await c.lpush(KEY, JSON.stringify(job));
    return { queued: true };
  } catch {
    // Redis went away between the check and the push. Falling back to inline
    // delivery is slower, but silently dropping a signup's code is worse.
    return { queued: false, delivered: await deliver(job) };
  }
}

/**
 * Drain the queue until stopped. Returns a stop function.
 *
 * Every API process runs one. BRPOP hands each job to exactly one of them, so
 * adding replicas adds throughput without sending anything twice.
 */
export function startMailWorker(log: { info: (o: unknown, m: string) => void; error: (o: unknown, m: string) => void }): () => void {
  let running = true;

  const loop = async () => {
    const c = await client();
    if (!c) return; // no queue configured; delivery is inline
    log.info({}, '📬 mail worker started');
    while (running) {
      let job: OtpMailJob | null = null;
      try {
        // 5s so a stopped worker exits promptly instead of hanging shutdown.
        const popped = await c.brpop(KEY, 5);
        if (!popped) continue;
        job = JSON.parse(popped[1]) as OtpMailJob;
        if (await deliver(job)) continue;
        throw new Error('the mail provider refused it');
      } catch (err) {
        if (!job) {
          // A Redis error, not a delivery one. Pause so a dead Redis does not
          // become a hot loop.
          if (running) await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        const attempt = (job.attempt ?? 0) + 1;
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => {
            void client().then((cc) => cc?.lpush(KEY, JSON.stringify({ ...job, attempt })));
          }, backoffMs(attempt)).unref();
          continue;
        }
        // Out of retries. The code never reached anyone, so it is dropped —
        // otherwise the resend cooldown would make the user wait out a code
        // they never received before they could ask for another.
        await discardOtp(job.identifier, job.purpose).catch(() => undefined);
        log.error({ err, purpose: job.purpose }, 'giving up on a verification email; the code was discarded so the user can ask again');
      }
    }
  };

  void loop().catch(() => undefined);

  return () => {
    running = false;
    void client().then((c) => c?.quit().catch(() => undefined));
  };
}

/** Tests only: forget the cached connection between cases. */
export function resetMailQueueForTests(): void {
  clientPromise = undefined;
}
