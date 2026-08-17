import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../config';
import * as schema from './schema';

export const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10 });

// Avoid crashing the process when idle connections are dropped (e.g. DB restart).
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message);
});

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export { schema };
