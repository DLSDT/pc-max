import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PasswordRule } from '@/components/ui/password-strength';

/**
 * The only hard requirement is 8 characters — that is what the server enforces
 * and what the forms gate on. Everything above it is advice, so the meter is
 * scored that way: reaching the real minimum already counts, and the rest just
 * moves the bar further right instead of showing a wall of red crosses for a
 * password the app would happily accept.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function usePasswordRules(): { rules: PasswordRule[]; labels: string[] } {
  const { t } = useTranslation();

  const rules = useMemo<PasswordRule[]>(
    () => [
      { id: 'length', label: t('auth.pwStrength.ruleLength'), test: (v) => v.length >= MIN_PASSWORD_LENGTH },
      { id: 'longer', label: t('auth.pwStrength.ruleLonger'), test: (v) => v.length >= 12 },
      { id: 'variety', label: t('auth.pwStrength.ruleVariety'), test: (v) => /[a-zA-Z]/.test(v) && /\d/.test(v) },
    ],
    [t],
  );

  const labels = useMemo(
    () => [
      t('auth.pwStrength.empty'),
      t('auth.pwStrength.weak'),
      t('auth.pwStrength.good'),
      t('auth.pwStrength.strong'),
    ],
    [t],
  );

  return { rules, labels };
}

/**
 * Client-side email check, deliberately matching the server's EMAIL_RE
 * (apps/api/src/lib/identifier.ts). It exists to fail fast in the form, not to
 * be the authority — the server re-validates and is the one that decides.
 *
 * Kept loose on purpose: rejecting an address the server would have accepted
 * is a worse failure than letting one through to a clean 400.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}
