import { buildApp } from './app';
import { config } from './config';
import { pool } from './db';

async function main() {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`);
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

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
