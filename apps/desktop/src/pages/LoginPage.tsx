import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, LogIn, Mail } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useAdminAuth } from '@/store/adminAuth';
import { Button } from '@/components/ui';
import { AuthAlert, AuthCard, AuthField, AuthFooter, AuthHeader } from '@/components/auth/AuthShell';
import { isValidEmail } from '@/lib/passwordRules';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuth((s) => s.login);
  const adminLogin = useAdminAuth((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Where the auth guard bounced them from, if anywhere. */
  const requested = (location.state as { from?: string } | null)?.from;
  // Where they were headed, unless that was the admin panel. Signing in as a
  // customer and being delivered to the admin area is how an ordinary user
  // ended up looking at a second password prompt they had no business seeing.
  const from = requested && !requested.startsWith('/admin') ? requested : undefined;

  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    if (!isValidEmail(email)) next.email = t('auth.invalidEmail');
    if (password.length < 1) next.password = t('auth.passwordRequired');
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  /**
   * One form for both audiences. Whichever kind of account the credentials
   * belong to decides where the user lands; an admin match opens the panel,
   * anything else falls through to the regular session. Falling through rather
   * than surfacing the admin error avoids revealing which kind of account, if
   * any, an address belongs to.
   */
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setBusy(true);
    try {
      try {
        await adminLogin(email.trim(), password);
        navigate('/admin', { replace: true });
        return;
      } catch {
        // Not an admin account — continue as a regular user.
      }
      await login(email.trim(), password);
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeader title={t('auth.signInTitle')} subtitle={t('auth.signInHint')} />

      <AuthCard>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <AuthField
            label={t('auth.email')}
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            dir="ltr"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
            }}
            error={fieldErrors.email}
            icon={<Mail className="size-4" />}
            disabled={busy}
          />

          <AuthField
            label={t('auth.password')}
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            dir="ltr"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
            }}
            error={fieldErrors.password}
            icon={<KeyRound className="size-4" />}
            disabled={busy}
          />

          {error && <AuthAlert message={error} />}

          <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={busy}>
            <LogIn aria-hidden className="size-4" />
            {busy ? t('auth.signingIn') : t('auth.signIn')}
          </Button>

          <p className="text-center">
            <Link
              to="/forgot-password"
              className="rounded text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('auth.forgotPassword')}
            </Link>
          </p>
        </form>
      </AuthCard>

      <AuthFooter>
        <p>
          {t('auth.noAccount')}{' '}
          <Link
            to="/register"
            className="rounded font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('auth.createAccount')}
          </Link>
        </p>
      </AuthFooter>
    </>
  );
}
