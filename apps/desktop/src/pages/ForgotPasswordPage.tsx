import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, MessageSquareText } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { PasswordStrength, type PasswordRule } from '@/components/ui/password-strength';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');

  const pwRules = useMemo<PasswordRule[]>(
    () => [
      { id: 'length', label: t('auth.pwStrength.ruleLength'), test: (v) => v.length >= 12 },
      { id: 'case', label: t('auth.pwStrength.ruleCase'), test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
      { id: 'digit', label: t('auth.pwStrength.ruleDigit'), test: (v) => /\d/.test(v) },
      { id: 'symbol', label: t('auth.pwStrength.ruleSymbol'), test: (v) => /[!-/:-@[-`{-~]/.test(v) },
    ],
    [t],
  );
  const pwLabels = useMemo(
    () => [
      t('auth.pwStrength.empty'),
      t('auth.pwStrength.weak'),
      t('auth.pwStrength.fair'),
      t('auth.pwStrength.good'),
      t('auth.pwStrength.strong'),
    ],
    [t],
  );
  const [confirm, setConfirm] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (identifier.trim().length < 6) {
      setError(t('auth.invalidIdentifier'));
      return;
    }
    setSending(true);
    try {
      await api.forgotPassword(identifier.trim());
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setSending(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword({ identifier: identifier.trim(), otp: otp.trim(), newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center gap-6">
        <div className="space-y-2 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <KeyRound aria-hidden className="mx-auto size-8 text-primary" />
          <p className="text-sm text-foreground">{t('auth.resetDone')}</p>
          <Button className="mt-2 w-full" onClick={() => navigate('/login')}>
            {t('auth.signIn')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center gap-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth.resetTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.resetHint')}</p>
      </div>

      <form onSubmit={codeSent ? onSubmit : sendCode} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1.5">
          <label htmlFor="fp-identifier" className="text-sm font-medium">
            {t('auth.emailOrPhone')}
          </label>
          <Input
            id="fp-identifier"
            type="text"
            inputMode="email"
            required
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t('auth.emailOrPhonePlaceholder')}
            dir="ltr"
            disabled={codeSent}
          />
        </div>

        {!codeSent ? (
          <Button type="submit" className="w-full" disabled={sending}>
            <MessageSquareText aria-hidden />
            {sending ? t('common.loading') : t('auth.sendCode')}
          </Button>
        ) : (
          <>
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-accent-foreground">{t('auth.codeSent', { identifier })}</p>

            <div className="space-y-1.5">
              <label htmlFor="fp-otp" className="text-sm font-medium">
                {t('auth.verificationCode')}
              </label>
              <Input
                id="fp-otp"
                type="text"
                inputMode="numeric"
                required
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="fp-password" className="text-sm font-medium">
                {t('auth.newPassword')}
              </label>
              <Input
                id="fp-password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              {password.length > 0 && (
                <PasswordStrength
                  value={password}
                  rules={pwRules}
                  labels={pwLabels}
                  guessableLabel={t('auth.pwStrength.guessable')}
                  className="pt-1"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fp-confirm" className="text-sm font-medium">
                {t('auth.confirmPassword')}
              </label>
              <Input
                id="fp-confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t('common.loading') : t('auth.resetTitle')}
            </Button>

            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={sending}
              className="w-full text-center text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              {t('auth.resendCode')}
            </button>
          </>
        )}

        {error && !codeSent && <p className="text-sm text-destructive">{error}</p>}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}
