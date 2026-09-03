import { createHash, randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db';
import { otpCodes } from '../db/schema';
import { config } from '../config';
import { tooManyRequests } from './errors';
import { isEmail } from './identifier';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export type OtpPurpose = 'register' | 'reset';

/** Match an OTP row by its normalized identifier (phone OR email column). */
function byIdentifier(identifier: string) {
  return isEmail(identifier) ? eq(otpCodes.email, identifier) : eq(otpCodes.phone, identifier);
}

const PURPOSE_ORDER: Record<OtpPurpose, number> = { register: 0, reset: 1 };

/**
 * Issue a new OTP for a normalized identifier (phone or email). Security:
 *  - 6-digit code from a CSPRNG (never logged, never stored in plaintext);
 *  - short expiry (config.OTP_TTL_SECONDS);
 *  - resend cooldown (config.OTP_RESEND_COOLDOWN) via the previous code's age;
 *  - previous unused codes for the same identifier+purpose are invalidated.
 * Returns the plaintext code ONLY so the caller can expose it in dev.
 */
export async function issueOtp(identifier: string, purpose: OtpPurpose): Promise<{ devCode?: string }> {
  const now = Date.now();

  // Resend cooldown: look at the most recent code for this identifier+purpose.
  const latest = await db.query.otpCodes.findFirst({
    where: and(byIdentifier(identifier), eq(otpCodes.purpose, purpose)),
    orderBy: desc(otpCodes.createdAt),
  });
  if (latest && latest.createdAt.getTime() + config.OTP_RESEND_COOLDOWN * 1000 > now) {
    throw tooManyRequests('Too many requests. Wait before requesting another code.');
  }

  // Invalidate previous unused codes for this identifier+purpose.
  await db
    .update(otpCodes)
    .set({ usedAt: new Date() })
    .where(and(byIdentifier(identifier), eq(otpCodes.purpose, purpose), isNull(otpCodes.usedAt)));

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.insert(otpCodes).values({
    ...(isEmail(identifier) ? { email: identifier } : { phone: identifier }),
    purpose,
    codeHash: sha256(code),
    expiresAt: new Date(now + config.OTP_TTL_SECONDS * 1000),
    attempts: 0,
  });

  return { devCode: code };
}

/**
 * Delete the unused codes for an identifier+purpose.
 *
 * For a code whose email could not be delivered. Marking it used would not be
 * enough: the resend cooldown looks at the newest row whatever its state, so
 * the user would have to wait out a code they never received before they could
 * ask for another.
 */
export async function discardOtp(identifier: string, purpose: OtpPurpose): Promise<void> {
  await db
    .delete(otpCodes)
    .where(and(byIdentifier(identifier), eq(otpCodes.purpose, purpose), isNull(otpCodes.usedAt)));
}

/** Verify a code. Single-use: success marks it used; failures count attempts. */
export async function verifyOtp(identifier: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  const row = await db.query.otpCodes.findFirst({
    where: and(
      byIdentifier(identifier),
      eq(otpCodes.purpose, purpose),
      isNull(otpCodes.usedAt),
      gt(otpCodes.expiresAt, new Date()),
    ),
    orderBy: desc(otpCodes.createdAt),
  });
  if (!row) return false;

  if (row.attempts >= config.OTP_MAX_ATTEMPTS) {
    // Exhausted — mark used so a fresh code must be requested.
    await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, row.id));
    return false;
  }

  const candidate = sha256(String(code).trim());
  const matches = timingSafeEqualHex(candidate, row.codeHash);
  await db.update(otpCodes).set({ attempts: row.attempts + 1 }).where(eq(otpCodes.id, row.id));

  if (matches) {
    await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, row.id));
    return true;
  }
  return false;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i]! ^ bufB[i]!;
  return diff === 0;
}

/** Whether an identifier is allowed to request a new code right now. */
export async function canResend(identifier: string, purpose: OtpPurpose): Promise<boolean> {
  const latest = await db.query.otpCodes.findFirst({
    where: and(byIdentifier(identifier), eq(otpCodes.purpose, purpose)),
    orderBy: desc(otpCodes.createdAt),
  });
  if (!latest) return true;
  return latest.createdAt.getTime() + config.OTP_RESEND_COOLDOWN * 1000 <= Date.now();
}

export { PURPOSE_ORDER };
