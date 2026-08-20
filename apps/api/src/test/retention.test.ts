import { describe, expect, it } from 'vitest';
import { formatRetention, type RetentionResult } from '../lib/retention';

/**
 * The destructive half is covered by the integration suite against a real
 * database; this pins the reporting and the "did nothing" path, which is what
 * shows up in boot logs every day.
 */
describe('retention reporting', () => {
  it('says so plainly when there is nothing to delete', () => {
    const results: RetentionResult[] = [
      { table: 'otp_codes', deleted: 0 },
      { table: 'views', deleted: 0 },
    ];
    expect(formatRetention(results)).toBe('🧹 retention: nothing to delete');
  });

  it('lists only the tables that changed', () => {
    const out = formatRetention([
      { table: 'otp_codes', deleted: 12 },
      { table: 'views', deleted: 0 },
      { table: 'login_attempts', deleted: 3 },
    ]);
    expect(out).toContain('otp_codes -12');
    expect(out).toContain('login_attempts -3');
    expect(out).not.toContain('views');
  });

  it('surfaces a failed table instead of hiding it', () => {
    expect(formatRetention([{ table: 'views', deleted: -1 }])).toContain('views FAILED');
  });
});
