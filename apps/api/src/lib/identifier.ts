/**
 * Unified account identifiers.
 *
 * Users authenticate with EITHER an email or a phone number. The server decides
 * which one the client sent — the client never declares the account type. Both
 * identifiers are normalized to one canonical form so the same value always
 * resolves to the same account (no duplicate accounts, no case/whitespace
 * drift). Phone normalization lives in `./phone` (E.164-ish international);
 * email normalization is trimmed + lowercased with format validation.
 */
import { normalizePhone } from './phone';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalize an email: trim whitespace, lowercase, validate format. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export type IdentifierKind = 'email' | 'phone';

export interface NormalizedIdentifier {
  kind: IdentifierKind;
  /** Canonical form — the value stored in `users.email` / `users.phone`. */
  value: string;
}

/**
 * Classify and normalize a raw identifier. Anything containing an `@` is
 * treated as an email; everything else must be a valid phone number.
 */
export function normalizeIdentifier(input: string): NormalizedIdentifier | null {
  const raw = input.trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    const email = normalizeEmail(raw);
    return email ? { kind: 'email', value: email } : null;
  }
  const phone = normalizePhone(raw);
  return phone ? { kind: 'phone', value: phone } : null;
}

/** True when the identifier is an email (used to pick delivery + DB column). */
export function isEmail(value: string): boolean {
  return value.includes('@');
}
