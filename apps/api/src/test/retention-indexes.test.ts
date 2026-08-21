import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The daily retention job deletes each table by its own age column. A missing
 * index there never errors — it just turns the nightly cleanup into a full
 * table scan, and these are precisely the tables that grow per-user. That only
 * hurts at scale, long after the change that caused it, so pin it here.
 *
 * Read from the schema source rather than a live database so it runs anywhere.
 */
const schema = readFileSync(path.resolve(__dirname, '../db/schema.ts'), 'utf-8');

/** table -> the column lib/retention.ts measures age by. */
const AGE_COLUMN: Record<string, string> = {
  otp_codes: 'createdAt',
  password_resets: 'createdAt',
  login_attempts: 'attemptedAt',
  user_sessions: 'expiresAt',
  sessions: 'expiresAt',
  views: 'viewedAt',
  client_errors: 'lastSeenAt',
  email_logs: 'createdAt',
  audit_logs: 'createdAt',
};

describe('retention age columns are indexed', () => {
  for (const [table, column] of Object.entries(AGE_COLUMN)) {
    it(`${table} has an index leading with ${column}`, () => {
      // Grab the table's definition block, then look for an index whose FIRST
      // column is the age column — a composite that leads with something else
      // (login_attempts once led with email) cannot serve a time-only DELETE.
      const start = schema.indexOf(`'${table}'`);
      expect(start, `${table} not found in schema`).toBeGreaterThan(-1);
      const block = schema.slice(start, start + 3000);
      const end = block.indexOf('\n);');
      const body = end === -1 ? block : block.slice(0, end);

      const leadsWithAge = new RegExp(`index\\('[^']+'\\)\\.on\\(t\\.${column}\\b`).test(body);
      expect(leadsWithAge, `no index leads with ${table}.${column}`).toBe(true);
    });
  }
});
