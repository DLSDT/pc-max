import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound, Mail, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { PasswordStrength } from '@/components/ui/password-strength';
import { OtpInput } from '@/components/ui/otp-input';
import { usePasswordRules, MIN_PASSWORD_LENGTH, isValidEmail } from '@/lib/passwordRules';
import { AuthAlert, AuthCard, AuthField, AuthFooter, AuthHeader } from '@/components/auth/AuthShell';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { rules: pwRules, labels: pwLabels } = usePasswordRules();

  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  function clearField(name: string) {
    setFieldErrors((f) => (f[name] ? { ...f, [name]: undefined } : f));
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setFieldErrors({ email: t('auth.invalidEmail') });
      return;
    }
    setSending(true);
    try {
      // Always succeeds for a well-formed address, whether or not an account
      // exists — that is the server's anti-enumeration behaviour, not a bug.
      await api.forgotPassword(email.trim());
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setSending(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const next: Record<string, string | undefined> = {};
    if (otp.length !== 6) next.otp = t('auth.otpIncomplete');
    if (password.length < MIN_PASSWORD_LENGTH) next.password = t('auth.passwordTooShort');
    if (confirm !== password) next.confirm = t('auth.passwordMismatch');
    setFieldErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setBusy(true);
    try {
      await api.resetPassword({ identifier: email.trim(), otp: otp.trim(), newPassword: password });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <>
        <AuthHeader title={t('auth.resetDoneTitle')} subtitle={t('auth.resetDoneHint')} />
        <AuthCard>
          <div className="flex flex-col items-center gap-5 py-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 aria-hidden className="size-6" />
            </span>
            <Button className="h-11 w-full text-sm font-semibold" onClick={() => navigate('/login', { replace: true })}>
              {t('auth.signIn')}
            </Button>
          </div>
        </AuthCard>
      </>
    );
  }

  return (
    <>
      <AuthHeader
        title={t('auth.resetTitle')}
        subtitle={step === 'email' ? t('auth.resetHint') : t('auth.codeSentTo', { email: email.trim() })}
      />

      <AuthCard>
        {step === 'email' ? (
          <form onSubmit={sendCode} noValidate className="space-y-5">
            <AuthField
              label={t('auth.email')}
              id="forgot-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
              dir="ltr"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearField('email');
              }}
              error={fieldErrors.email}
              icon={<Mail className="size-4" />}
              disabled={sending}
            />

            {error && <AuthAlert message={error} />}

            <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={sending}>
              <Send aria-hidden className="size-4" />
              {sending ? t('auth.sendingCode') : t('auth.sendCode')}
            </Button>
          </form>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <OtpInput
              label={t('auth.verificationCode')}
              autoFocus
              disabled={busy}
              status={fieldErrors.otp ? 'error' : 'idle'}
              errorMessage={fieldErrors.otp}
              onChange={(v) => {
                setOtp(v);
                clearField('otp');
              }}
            />

            <div className="space-y-2">
              <AuthField
                label={t('auth.newPassword')}
                id="reset-password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                dir="ltr"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearField('password');
                }}
                error={fieldErrors.password}
                icon={<KeyRound className="size-4" />}
                disabled={busy}
              />
              <PasswordStrength value={password} rules={pwRules} labels={pwLabels} />
            </div>

            <AuthField
              label={t('auth.confirmPassword')}
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              dir="ltr"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                clearField('confirm');
              }}
              error={fieldErrors.confirm}
              icon={<KeyRound className="size-4" />}
              disabled={busy}
            />

            {error && <AuthAlert message={error} />}

            <div className="space-y-2.5">
              <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={busy}>
                <KeyRound aria-hidden className="size-4" />
                {busy ? t('auth.resetting') : t('auth.resetPassword')}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setError(null);
                  setFieldErrors({});
                }}
                disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeft aria-hidden className="size-3.5 rtl:rotate-180" />
                {t('auth.changeEmail')}
              </button>
            </div>
          </form>
        )}
      </AuthCard>

      <AuthFooter>
        <p>
          <Link
            to="/login"
            className="rounded font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('auth.backToSignIn')}
          </Link>
        </p>
      </AuthFooter>
    </>
  );
}
