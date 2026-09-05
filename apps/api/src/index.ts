import { buildApp } from './app';
import { config } from './config';
import { pool } from './db';
import { initMonitoring } from './lib/monitoring';
import { startMailWorker } from './lib/mail-queue';
import { formatRetention, runRetention } from './lib/retention';

async function main() {
  initMonitoring();
  const app = await buildApp();

  // Drains the verification-mail queue. Every process runs one; BRPOP hands a
  // job to exactly one of them, so replicas add throughput rather than
  // duplicate mail. Without REDIS_URL this returns immediately and delivery
  // stays inline, which is what tests and single-container installs get.
  const stopMailWorker = startMailWorker(app.log);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`);
    stopMailWorker();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Trim aged exhaust (OTP codes, login attempts, dead sessions, old view
  // events). Runs in-process because this deploys as a single container with
  // no scheduler; RETENTION_INTERVAL_HOURS=0 turns it off if an external cron
  // takes over. Failures are logged, never fatal — a stuck cleanup must not
  // take the API down.
  //
  // A second API process would run this too. The deletes are idempotent so
  // nothing breaks, but three processes sweeping the same tables on the same
  // schedule is three times the load for one sweep's worth of work — set
  // RETENTION_INTERVAL_HOURS=0 on every replica but one.
  let retentionTimer: NodeJS.Timeout | undefined;
  if (config.RETENTION_INTERVAL_HOURS > 0) {
    const trim = async () => {
      try {
        app.log.info(formatRetention(await runRetention()));
      } catch (err) {
        app.log.error({ err }, 'retention run failed');
      }
    };
    void trim();
    retentionTimer = setInterval(() => void trim(), config.RETENTION_INTERVAL_HOURS * 3600_000);
    // Don't hold the process open on shutdown.
    retentionTimer.unref();
  }
  void retentionTimer;

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
    app.log.info(`API ready at http://${config.HOST}:${config.PORT}`);
    app.log.info(`OpenAPI docs at http://${config.HOST}:${config.PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
