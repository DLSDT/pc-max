import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { PackageChoice } from '@goh/types';
import { cn } from '@/lib/utils';

function bytes(n: number): string {
  if (n <= 0) return '';
  const mb = n / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * A radio group over one component's published choices.
 *
 * It renders exactly the entries the server returned. When fewer are published
 * than expected, the count is shown plainly rather than padded with entries
 * that would install nothing — an unselectable "Plan 7" that silently no-ops is
 * worse than an honest six.
 */
export default function ChoiceGrid({
  label,
  hint,
  choices,
  value,
  onChange,
  disabled,
  expected,
  emptyMessage,
}: {
  label: string;
  hint?: string;
  choices: PackageChoice[];
  value: string | null;
  onChange: (name: string) => void;
  disabled?: boolean;
  /** How many the product expects, for the "6 of 12 published" line. */
  expected?: number;
  emptyMessage: string;
}) {
  const { t } = useTranslation();
  const short = expected !== undefined && choices.length > 0 && choices.length !== expected;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {expected !== undefined
            ? t('optiscaler.countOf', { n: choices.length, expected })
            : t('optiscaler.count', { n: choices.length })}
        </span>
      </div>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}

      {choices.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <>
          {short && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{t('optiscaler.fewerThanExpected')}</p>}
          <div role="radiogroup" aria-label={label} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {choices.map((c) => {
              const selected = value === c.name;
              const unusable = c.fileCount === 0;
              return (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled || unusable}
                  onClick={() => onChange(c.name)}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-start transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-accent/40',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {selected && <Check aria-hidden className="size-3.5 shrink-0" />}
                    <span className="truncate font-mono text-sm font-medium" dir="ltr">
                      {c.name}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] opacity-70">
                    {unusable ? t('optiscaler.noFiles') : `${t('optiscaler.files', { count: c.fileCount })} · ${bytes(c.totalBytes)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
