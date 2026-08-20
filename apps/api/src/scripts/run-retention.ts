/** Run the retention trim once, by hand: `npm run db:retention -w @goh/api`. */
import { formatRetention, runRetention } from '../lib/retention';
import { pool } from '../db';

runRetention()
  .then((r) => {
    process.stdout.write(formatRetention(r) + '\n');
    return pool.end();
  })
  .catch(async (err) => {
    console.error('❌ retention failed:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
