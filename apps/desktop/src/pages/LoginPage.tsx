import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { Button, Input } from '@/components/ui';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (identifier.trim().length < 6) {
      setError(t('auth.invalidIdentifier'));
      return;
    }
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      navigate('/subscription');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center gap-6">
      <div className="space-y-3 text-center">
        <img
          src="/icon.png"
          alt={t('appName')}
          className="mx-auto size-16 rounded-2xl object-contain shadow-sm"
          draggable={false}
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('appName')}</h1>
          <p className="text-sm font-medium text-primary">{t('tagline')}</p>
          <p className="text-sm text-muted-foreground">{t('auth.signInHint')}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1.5">
          <label htmlFor="login-identifier" className="text-sm font-medium">
            {t('auth.emailOrPhone')}
          </label>
          <Input
            id="login-identifier"
            type="text"
            inputMode="email"
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t('auth.emailOrPhonePlaceholder')}
            dir="ltr"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="login-password" className="text-sm font-medium">
            {t('auth.password')}
          </label>
          <Input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          <LogIn aria-hidden />
          {busy ? t('common.loading') : t('auth.signIn')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link to="/forgot-password" className="font-medium text-primary hover:underline">
          {t('auth.forgotPassword')}
        </Link>
      </p>
      <p className="text-center text-sm text-muted-foreground">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          {t('auth.createAccount')}
        </Link>
      </p>
    </div>
  );
}
