import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquareText, UserPlus } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { PasswordStrength } from '@/components/ui/password-strength';
import { usePasswordRules, MIN_PASSWORD_LENGTH } from '@/lib/passwordRules';
import { OtpInput } from '@/components/ui/otp-input';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuth((s) => s.register);
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { rules: pwRules, labels: pwLabels } = usePasswordRules();

  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (identifier.trim().length < 6) {
      setError(t('auth.invalidIdentifier'));
      return;
    }
    setSending(true);
    try {
      await api.sendOtp(identifier.trim(), 'register');
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
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (otp.length !== 6) {
      setError(t('auth.verificationCode'));
      return;
    }
    setBusy(true);
    try {
      await register({ identifier: identifier.trim(), password, username: username.trim() || undefined, otp: otp.trim() });
      navigate('/subscription');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center gap-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth.createAccount')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.registerHint')}</p>
      </div>

      <form onSubmit={codeSent ? onSubmit : sendCode} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1.5">
          <label htmlFor="reg-identifier" className="text-sm font-medium">
            {t('auth.emailOrPhone')}
          </label>
          <Input
            id="reg-identifier"
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
              <label htmlFor="reg-otp" className="text-sm font-medium">
                {t('auth.verificationCode')}
              </label>
              {/* One box per digit: supports pasting the whole code and shakes
                  on a rejected code. Kept LTR so digits don't reorder in RTL. */}
              <OtpInput
                label={t('auth.verificationCode')}
                status={error ? 'error' : 'idle'}
                onChange={setOtp}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-username" className="text-sm font-medium">
                {t('auth.username')} <span className="text-muted-foreground">({t('auth.optional')})</span>
              </label>
              <Input
                id="reg-username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="gamer"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="text-sm font-medium">
                {t('auth.password')}
              </label>
              <Input
                id="reg-password"
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
              <label htmlFor="reg-confirm" className="text-sm font-medium">
                {t('auth.confirmPassword')}
              </label>
              <Input
                id="reg-confirm"
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
              <UserPlus aria-hidden />
              {busy ? t('common.loading') : t('auth.createAccount')}
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
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}
