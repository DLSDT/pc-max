import { sql } from 'drizzle-orm';
import { db } from '../db';
import { config } from '../config';

/**
 * Data retention.
 *
 * Every table below is append-only and previously had no cleanup at all: OTP
 * codes, login attempts, expired refresh tokens and view events accumulate on
 * every single auth attempt and page view. At a few users that is invisible;
 * at ten thousand over several years it is the largest thing in the database,
 * and it slows the very queries that scan it (lockout checks, popular-games
 * counts) while inflating every backup.
 *
 * Windows are deliberately generous — this trims exhaust, it does not touch
 * anything a user or an admin would look for. Business data (users, games,
 * subscriptions, payments, profiles) is NEVER deleted here.
 */

export interface RetentionResult {
  table: string;
  deleted: number;
}

/** Days to keep, per table. Overridable via env for a slower/faster trim. */
const DAYS = {
  /** Codes are single-use and expire in minutes; a day is plenty for support. */
  otpCodes: config.RETENTION_OTP_DAYS,
  /** Lockout only looks at a short window; the rest is audit trail. */
  loginAttempts: config.RETENTION_LOGIN_ATTEMPT_DAYS,
  /** Only rows already past `expires_at` (or revoked) are considered. */
  sessions: config.RETENTION_SESSION_DAYS,
  /** Raw analytics events. `games.view_count` is a separate running total and is untouched. */
  views: config.RETENTION_VIEW_DAYS,
  /** Only crashes already marked resolved. */
  clientErrors: config.RETENTION_CLIENT_ERROR_DAYS,
  emailLogs: config.RETENTION_EMAIL_LOG_DAYS,
  auditLogs: config.RETENTION_AUDIT_LOG_DAYS,
} as const;

async function purge(table: string, where: string, days: number): Promise<RetentionResult> {
  const res = await db.execute(
    sql.raw(`DELETE FROM "${table}" WHERE ${where} AND now() - interval '${days} days' > ${tsColumn(table)}`),
  );
  return { table, deleted: res.rowCount ?? 0 };
}

/** The column that decides a row's age, per table. */
function tsColumn(table: string): string {
  switch (table) {
    case 'login_attempts':
      return 'attempted_at';
    case 'views':
      return 'viewed_at';
    case 'client_errors':
      return 'last_seen_at';
    case 'user_sessions':
    case 'sessions':
      return 'expires_at';
    default:
      return 'created_at';
  }
}

/**
 * Delete aged-out rows. Safe to run concurrently and on every boot — each
 * statement is an independent bounded DELETE, and a failure in one table does
 * not stop the others.
 */
export async function runRetention(): Promise<RetentionResult[]> {
  const jobs: Array<[string, string, number]> = [
    // Used or expired codes only — a live, unused code is never removed.
    ['otp_codes', '(used_at IS NOT NULL OR expires_at < now())', DAYS.otpCodes],
    ['password_resets', '(used_at IS NOT NULL OR expires_at < now())', DAYS.otpCodes],
    ['login_attempts', 'TRUE', DAYS.loginAttempts],
    // Only sessions that can no longer authenticate anyone.
    ['user_sessions', '(revoked_at IS NOT NULL OR expires_at < now())', DAYS.sessions],
    ['sessions', '(revoked_at IS NOT NULL OR expires_at < now())', DAYS.sessions],
    ['views', 'TRUE', DAYS.views],
    ['client_errors', 'resolved = true', DAYS.clientErrors],
    ['email_logs', 'TRUE', DAYS.emailLogs],
    ['audit_logs', 'TRUE', DAYS.auditLogs],
  ];

  const results: RetentionResult[] = [];
  for (const [table, where, days] of jobs) {
    try {
      results.push(await purge(table, where, days));
    } catch (err) {
      // A missing table or a locked row must not take the API down.
      results.push({ table, deleted: -1 });
      // eslint-disable-next-line no-console
      console.error(`retention: ${table} failed`, err instanceof Error ? err.message : err);
    }
  }
  return results;
}

export function formatRetention(results: RetentionResult[]): string {
  const rows = results.filter((r) => r.deleted !== 0);
  if (rows.length === 0) return '🧹 retention: nothing to delete';
  return `🧹 retention: ${rows.map((r) => `${r.table} ${r.deleted < 0 ? 'FAILED' : `-${r.deleted}`}`).join(', ')}`;
}
