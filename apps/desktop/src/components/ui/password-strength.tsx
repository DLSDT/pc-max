import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Password strength meter.
 *
 * Adapted from the `motion`-based original: the animations here are plain CSS
 * transitions (transform/opacity) instead, which look identical for a meter
 * this simple and avoid adding a ~50KB animation runtime to a desktop bundle
 * that is already over the chunk-size budget. `prefers-reduced-motion` is
 * honoured via the global media query in index.css.
 *
 * Accessibility is preserved: role="meter" with live values, plus a debounced
 * aria-live summary so screen readers aren't spammed on every keystroke.
 */

const COMMON = /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456)/i;
const RUN = /(.)\1{3,}/;
const RUN_UP = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i;
const SYMBOL = /[!-/:-@[-`{-~]/;

export type PasswordRule = {
  id: string;
  label: string;
  test: (value: string) => boolean;
};

export type EvaluatedRule = PasswordRule & { met: boolean };

export type PasswordStrengthState = {
  score: number;
  max: number;
  label: string;
  rules: EvaluatedRule[];
  guessable: boolean;
  announcement: string;
};

export const defaultPasswordRules: readonly PasswordRule[] = [
  { id: 'length', label: '12 characters or more', test: (v) => v.length >= 12 },
  { id: 'case', label: 'Upper and lower case', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { id: 'digit', label: 'A number', test: (v) => /\d/.test(v) },
  { id: 'symbol', label: 'A symbol', test: (v) => SYMBOL.test(v) },
];

const defaultLabels = ['Empty', 'Weak', 'Fair', 'Good', 'Strong'] as const;

export function usePasswordStrength(
  value: string,
  {
    rules = defaultPasswordRules,
    labels = defaultLabels as readonly string[],
    announceDelay = 700,
  }: { rules?: readonly PasswordRule[]; labels?: readonly string[]; announceDelay?: number } = {},
): PasswordStrengthState {
  const state = useMemo(() => {
    const evaluated = rules.map((rule) => ({ ...rule, met: rule.test(value) }));
    const passed = evaluated.reduce((n, r) => n + (r.met ? 1 : 0), 0);
    const guessable = value.length > 0 && (COMMON.test(value) || RUN.test(value) || RUN_UP.test(value));

    const score = value.length === 0 ? 0 : guessable ? 1 : Math.min(rules.length, Math.max(1, passed));
    const label = labels[Math.min(score, labels.length - 1)] ?? '';
    const unmet = evaluated.filter((r) => !r.met);

    const announcement =
      value.length === 0
        ? ''
        : [
            `Password strength ${label.toLowerCase()}.`,
            guessable ? 'This is a commonly guessed pattern.' : '',
            unmet.length === 0 ? 'All requirements met.' : `Still needed: ${unmet.map((r) => r.label.toLowerCase()).join(', ')}.`,
          ]
            .filter(Boolean)
            .join(' ');

    return { score, max: rules.length, label, rules: evaluated, guessable, announcement };
  }, [value, rules, labels]);

  // Debounce the spoken summary so typing doesn't flood the live region.
  const [settled, setSettled] = useState('');
  useEffect(() => {
    if (state.announcement === '') {
      setSettled('');
      return;
    }
    const id = setTimeout(() => setSettled(state.announcement), announceDelay);
    return () => clearTimeout(id);
  }, [state.announcement, announceDelay]);

  return { ...state, announcement: settled };
}

const TONES = {
  none: { bar: 'bg-muted-foreground/30', text: 'text-muted-foreground' },
  danger: { bar: 'bg-destructive', text: 'text-destructive' },
  caution: { bar: 'bg-amber-500', text: 'text-amber-500' },
  safe: { bar: 'bg-emerald-500', text: 'text-emerald-500' },
} as const;

function toneFor(score: number, max: number) {
  if (score === 0) return TONES.none;
  const ratio = score / max;
  if (ratio <= 0.34) return TONES.danger;
  if (ratio <= 0.67) return TONES.caution;
  return TONES.safe;
}

export type PasswordStrengthProps = {
  value: string;
  rules?: readonly PasswordRule[];
  labels?: readonly string[];
  /** Per-rule hint list under the meter. */
  showRules?: boolean;
  /** Shown when the password matches a well-known guessable pattern. */
  guessableLabel?: string;
  className?: string;
};

export function PasswordStrength({
  value,
  rules = defaultPasswordRules,
  labels = defaultLabels as readonly string[],
  showRules = true,
  guessableLabel,
  className,
}: PasswordStrengthProps) {
  const { t } = useTranslation();
  const { score, max, label, rules: evaluated, guessable, announcement } = usePasswordStrength(value, { rules, labels });
  const tone = toneFor(score, max);

  return (
    <div className={cn('w-full', className)}>
      <div
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={score}
        aria-valuetext={label}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: max }, (_, i) => (
          <div key={i} className="relative h-1.5 overflow-hidden rounded-sm bg-secondary">
            <span
              className={cn('absolute inset-0 origin-left rounded-sm transition-transform duration-300', tone.bar)}
              style={{ transform: `scaleX(${i < score ? 1 : 0})`, transitionDelay: i < score ? `${i * 30}ms` : '0ms' }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex h-5 items-center justify-between gap-3">
        <span className={cn('text-xs font-medium leading-5 transition-colors duration-200', tone.text)}>{label}</span>
        <span
          aria-hidden
          className="whitespace-nowrap text-[11px] leading-5 text-amber-500 transition-opacity duration-200"
          style={{ opacity: guessable ? 1 : 0 }}
        >
          {guessableLabel ?? t('auth.pwGuessable')}
        </span>
      </div>

      {showRules && (
        <ul className="mt-3 grid gap-1.5">
          {evaluated.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2">
              <span className="relative grid size-3.5 shrink-0 place-items-center rounded border border-border">
                <span
                  className="absolute inset-0 rounded-[3px] bg-emerald-500 transition-opacity duration-200"
                  style={{ opacity: rule.met ? 1 : 0 }}
                />
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden
                  className="relative size-2.5 text-white transition-all duration-200"
                  style={{ opacity: rule.met ? 1 : 0, transform: `scale(${rule.met ? 1 : 0.6})` }}
                >
                  <path d="M2 6.2 4.7 8.9 10 3.3" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className={cn('text-xs leading-5 transition-colors duration-200', rule.met ? 'text-foreground' : 'text-muted-foreground')}>
                {rule.label}
              </span>
              <span className="sr-only">{rule.met ? t('auth.pwMet') : t('auth.pwNotMet')}</span>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export default PasswordStrength;
