import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A restore inserts every row with its original id, which bypasses the serial
 * sequences entirely. If they are not reset afterwards they still point at 1
 * while the table holds ids 1..N, and the NEXT ordinary insert fails on the
 * primary key.
 *
 * That is not a restore-time error — it surfaces much later, as a 500 from
 * whatever the user happened to do first. On the production server it took out
 * POST /auth/login (login_attempts) and POST /views (views): every sign-in
 * attempt returned "Something went wrong" while the API looked healthy.
 */
const SRC = readFileSync(join(__dirname, '../scripts/restore-db.ts'), 'utf-8');

describe('restore-db', () => {
  it('resets id sequences after inserting rows', () => {
    expect(SRC).toMatch(/setval/);
  });

  it('discovers the sequences instead of hardcoding a table list', () => {
    // Hardcoding would silently miss the next table that gets a serial id.
    expect(SRC).toMatch(/pg_get_serial_sequence/);
  });

  it('resets them inside the restore transaction', () => {
    // After COMMIT the window is already open for a request to collide.
    const setvalAt = SRC.indexOf('setval');
    const commitAt = SRC.indexOf("client.query('COMMIT')");
    expect(setvalAt).toBeGreaterThan(-1);
    expect(commitAt).toBeGreaterThan(-1);
    expect(setvalAt, 'sequences must be reset before COMMIT').toBeLessThan(commitAt);
  });

  it('handles an empty table without handing out id 0', () => {
    // setval(seq, 1, false) leaves the next value at 1; setval(seq, 0) is an
    // error, and setval(seq, 1, true) would skip id 1 on a fresh table.
    expect(SRC).toMatch(/IS NOT NULL\)/);
  });
});
