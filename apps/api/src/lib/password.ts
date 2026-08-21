import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** Hash a password with Argon2id (OWASP-recommended defaults). */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/**
 * A real Argon2id hash of an unguessable value, used to burn the same CPU time
 * on a miss as on a hit.
 *
 * Skipping the hash when no account matches makes a failed login measurably
 * faster than a wrong-password login, which is enough to enumerate which
 * emails and phone numbers are registered — the generic error message alone
 * does not hide that.
 */
const DUMMY_HASH = hash(randomBytes(32).toString('hex'));

/**
 * Verify a password against a possibly-missing hash in constant-ish time.
 *
 * Returns false for accounts with no password set (device-registered rows have
 * a null `password_hash`) instead of letting Argon2 throw a 500.
 */
export async function verifyPasswordOrDecoy(plain: string, hashed: string | null | undefined): Promise<boolean> {
  if (!hashed) {
    await verify(await DUMMY_HASH, plain).catch(() => false);
    return false;
  }
  return verify(hashed, plain);
}
