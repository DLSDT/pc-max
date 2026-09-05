import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared pieces for the three auth screens.
 *
 * They exist so login, register and password reset cannot drift apart: one
 * field style, one error treatment, one card. Everything here is presentation —
 * validation and submission stay in the pages.
 */

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-lg backdrop-blur-sm sm:p-8">{children}</div>
  );
}

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { t } = useTranslation();
  return (
    <div className="mb-7 flex flex-col items-center gap-4 text-center">
      <img
        src="/icon.png"
        alt=""
        aria-hidden
        className="size-14 rounded-2xl object-contain shadow-sm ring-1 ring-border"
        draggable={false}
      />
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t('appName')}</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-balance text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Validation message. Present = invalid; drives styling and aria-invalid. */
  error?: string | null;
  hint?: string;
  icon?: ReactNode;
}

/**
 * Labelled input with inline validation. The message is wired to the input
 * through aria-describedby and announced politely, so it is not colour-only.
 */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, error, hint, icon, className, type, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            'h-11 w-full rounded-xl border bg-background/60 text-sm text-foreground shadow-sm transition-colors',
            'placeholder:text-muted-foreground/70',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
            'disabled:cursor-not-allowed disabled:opacity-60',
            icon ? 'ps-10' : 'ps-3.5',
            isPassword ? 'pe-11' : 'pe-3.5',
            error
              ? 'border-destructive/60 focus-visible:ring-destructive/40'
              : 'border-input hover:border-primary/40 focus-visible:border-primary focus-visible:ring-ring',
            className,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            title={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            tabIndex={-1}
            className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            {revealed ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-destructive">
          <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/** Whole-form failure (bad credentials, network, server). */
export function AuthAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 space-y-2.5 text-center text-sm text-muted-foreground">{children}</div>;
}
