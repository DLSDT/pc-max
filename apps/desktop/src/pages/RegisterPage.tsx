import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, AtSign, KeyRound, Mail, Send, UserPlus } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { PasswordStrength } from '@/components/ui/password-strength';
import { OtpInput } from '@/components/ui/otp-input';
import { usePasswordRules, MIN_PASSWORD_LENGTH, isValidEmail } from '@/lib/passwordRules';
import { AuthAlert, AuthCard, AuthField, AuthFooter, AuthHeader } from '@/components/auth/AuthShell';

type Step = 'email' | 'details';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuth((s) => s.register);
  const { rules: pwRules, labels: pwLabels } = usePasswordRules();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  function clearField(name: string) {
    setFieldErrors((f) => (f[name] ? { ...f, [name]: undefined } : f));
  }

  /** Step 1 — verify the address is ours before asking for anything else. */
  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setFieldErrors({ email: t('auth.invalidEmail') });
      return;
    }
    setSending(true);
    try {
      await api.sendOtp(email.trim(), 'register');
      setStep('details');
    } catch (err) {
      // A delivery failure now surfaces as an error instead of a silent
      // "code sent", so say so rather than advancing to a code that never came.
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setSending(false);
    }
  }

  async function resend() {
    setError(null);
    setSending(true);
    try {
      await api.sendOtp(email.trim(), 'register');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setSending(false);
    }
  }

  /** Step 2 — code + password. */
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const next: Record<string, string | undefined> = {};
    if (password.length < MIN_PASSWORD_LENGTH) next.password = t('auth.passwordTooShort');
    if (confirm !== password) next.confirm = t('auth.passwordMismatch');
    if (otp.length !== 6) next.otp = t('auth.otpIncomplete');
    setFieldErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setBusy(true);
    try {
      await register({
        identifier: email.trim(),
        password,
        username: username.trim() || undefined,
        otp: otp.trim(),
      });
      navigate('/subscription', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeader
        title={t('auth.createAccountTitle')}
        subtitle={step === 'email' ? t('auth.registerHint') : t('auth.codeSentTo', { email: email.trim() })}
      />

      <AuthCard>
        {step === 'email' ? (
          <form onSubmit={sendCode} noValidate className="space-y-5">
            <AuthField
              label={t('auth.email')}
              id="register-email"
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
              hint={t('auth.registerEmailHint')}
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
            <div className="space-y-2">
              {/* OtpInput is uncontrolled and owns its own status/error slot. */}
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
              <button
                type="button"
                onClick={() => void resend()}
                disabled={sending || busy}
                className="rounded text-xs font-medium text-primary underline-offset-4 transition-colors hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {sending ? t('auth.sendingCode') : t('auth.resendCode')}
              </button>
            </div>

            <AuthField
              label={t('auth.usernameOptional')}
              id="register-username"
              type="text"
              autoComplete="nickname"
              dir="ltr"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearField('username');
              }}
              error={fieldErrors.username}
              icon={<AtSign className="size-4" />}
              disabled={busy}
            />

            <div className="space-y-2">
              <AuthField
                label={t('auth.password')}
                id="register-password"
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
              id="register-confirm"
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
                <UserPlus aria-hidden className="size-4" />
                {busy ? t('auth.creatingAccount') : t('auth.createAccount')}
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
          {t('auth.haveAccount')}{' '}
          <Link
            to="/login"
            className="rounded font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('auth.signIn')}
          </Link>
        </p>
      </AuthFooter>
    </>
  );
}
