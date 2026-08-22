/**
 * Account identifiers.
 *
 * Phone authentication is disabled: an identifier is an email address, trimmed
 * and lowercased so the same address always resolves to the same account (no
 * duplicates, no case drift). The `kind` discriminator is kept because callers
 * branch on it and phone support is expected back later — it just never
 * reports 'phone' today.
 *
 * Existing rows may still hold a phone number from before; those accounts can
 * no longer authenticate by phone, which is deliberate. `./phone` is retained
 * for that stored data, not for auth.
 */

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
 * Normalize a raw identifier. Returns null for anything that is not a valid
 * email — including phone-shaped input, which no longer authenticates.
 */
export function normalizeIdentifier(input: string): NormalizedIdentifier | null {
  const email = normalizeEmail(input);
  return email ? { kind: 'email', value: email } : null;
}

/** True when the identifier is an email (used to pick delivery + DB column). */
export function isEmail(value: string): boolean {
  return value.includes('@');
}
