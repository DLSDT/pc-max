import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../config';
import * as schema from './schema';

/**
 * Ten was a single container's number, and it is the ceiling on how much work
 * this process can have in flight at the database at once — shared by every
 * request, not just the slow ones. Configurable so it can be raised with the
 * hardware, and so a deployment running several API processes can size each
 * pool against Postgres's own `max_connections` rather than multiplying a
 * constant nobody chose.
 */
export const pool = new Pool({ connectionString: config.DATABASE_URL, max: config.DB_POOL_MAX });

// Avoid crashing the process when idle connections are dropped (e.g. DB restart).
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message);
});

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export { schema };
