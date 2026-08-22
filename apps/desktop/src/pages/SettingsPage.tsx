import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, CreditCard, Gamepad2, Globe, Heart, History, Info, KeyRound, Loader2, LogOut, Moon, RefreshCw, Sun, UserRound } from 'lucide-react';
import { applyDirection } from '@/i18n';
import { api } from '@/lib/api';
import { config, getRuntimeAppVersion } from '@/lib/config';
import { applyTheme } from '@/lib/theme';
import RestorePanel from '@/components/RestorePanel';
import { checkNativeUpdate, installNativeUpdate, isTauriShell } from '@/lib/updater';
import { getSubscription } from '@/lib/subscription';
import { useAuth } from '@/store/auth';
import { useUi } from '@/store/ui';
import { Badge, Button, Spinner } from '@/components/ui';
import ProfileHeader, { ProfileMenuItem } from '@/components/ProfileHeader';
import { formatDateTime } from '@/lib/labels';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fa', label: 'فارسی' },
] as const;

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const language = useUi((s) => s.language);
  const setLanguage = useUi((s) => s.setLanguage);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const autoUpdate = useUi((s) => s.autoUpdate);
  const setAutoUpdate = useUi((s) => s.setAutoUpdate);
  const user = useAuth((s) => s.user);
  const authReady = useAuth((s) => s.ready);
  const logout = useAuth((s) => s.logout);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [subActive, setSubActive] = useState(false);
  const [subChecked, setSubChecked] = useState(false);
  const [appVersion, setAppVersion] = useState<string>(config.appVersion);

  useEffect(() => {
    void getRuntimeAppVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    if (!user) return;
    getSubscription()
      .then((s) => {
        setSubActive(Boolean(s?.isActive));
        setSubChecked(true);
      })
      .catch(() => setSubChecked(true));
  }, [user]);

  async function onCheckUpdate() {
    setCheckingUpdate(true);
    setUpdateMsg(null);
    try {
      const res = await checkNativeUpdate();
      if (!isTauriShell()) {
        setUpdateMsg(t('settings.updateDesktopOnly'));
      } else if (!res.hasUpdate) {
        setUpdateMsg(t('settings.upToDate'));
      } else if (autoUpdate) {
        // Installing relaunches the app, so this only returns on failure.
        setUpdateMsg(t('settings.installing', { version: res.version ?? '' }));
        const ok = await installNativeUpdate();
        if (!ok) setUpdateMsg(t('settings.updateFailed'));
      } else {
        setUpdateMsg(t('settings.updateFound', { version: res.version ?? '' }));
      }
    } catch {
      setUpdateMsg(t('settings.updateFailed'));
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function onSignOut() {
    await logout();
    await queryClient.invalidateQueries();
    navigate('/');
  }

  function onLanguage(code: 'en' | 'fa') {
    setLanguage(code);
    void i18n.changeLanguage(code);
    applyDirection(code);
  }

  function onTheme(next: 'light' | 'dark') {
    setTheme(next);
    applyTheme(next);
  }


  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>

      {/* Account — profile hero + quick links, then the app settings below. */}
      {!authReady ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-10">
          <Spinner />
        </div>
      ) : user ? (
        <>
          <ProfileHeader />

          <div className="grid gap-2 sm:grid-cols-2">
            <ProfileMenuItem to="/library" icon={<Gamepad2 aria-hidden />} label={t('profile.menuLibrary')} />
            <ProfileMenuItem to="/favorites" icon={<Heart aria-hidden />} label={t('profile.menuFavorites')} />
            <ProfileMenuItem to="/recently-viewed" icon={<History aria-hidden />} label={t('profile.menuRecent')} />
            <ProfileMenuItem to="/subscription" icon={<CreditCard aria-hidden />} label={t('profile.menuSubscription')} />
            <ProfileMenuItem to="/forgot-password" icon={<KeyRound aria-hidden />} label={t('profile.menuPassword')} />
            <ProfileMenuItem to="/about" icon={<Info aria-hidden />} label={t('profile.menuAbout')} />
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => void onSignOut()}>
              <LogOut aria-hidden />
              {t('auth.signOut')}
            </Button>
          </div>
        </>
      ) : (
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UserRound aria-hidden className="size-4 text-primary" />
            {t('auth.account')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('auth.signInRequired')}</p>
          <Button size="sm" onClick={() => navigate('/login')}>
            <UserRound aria-hidden />
            {t('auth.signIn')}
          </Button>
        </section>
      )}

      {/* Appearance — theme and language are the same shape, so they pair up. */}
      <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {theme === 'dark' ? <Moon aria-hidden className="size-4 text-primary" /> : <Sun aria-hidden className="size-4 text-primary" />}
          {t('settings.theme')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('settings.themeHint')}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onTheme('light')}
            aria-pressed={theme === 'light'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              theme === 'light'
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-background/40 text-muted-foreground hover:bg-accent',
            )}
          >
            <Sun aria-hidden className="size-4" />
            {t('settings.light')}
          </button>
          <button
            type="button"
            onClick={() => onTheme('dark')}
            aria-pressed={theme === 'dark'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              theme === 'dark'
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-background/40 text-muted-foreground hover:bg-accent',
            )}
          >
            <Moon aria-hidden className="size-4" />
            {t('settings.dark')}
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Globe aria-hidden className="size-4 text-primary" />
          {t('settings.language')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('settings.languageHint')}</p>
        <div className="flex gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => onLanguage(l.code)}
              aria-pressed={language === l.code}
              className={cn(
                'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                language === l.code
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-background/40 text-muted-foreground hover:bg-accent',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>
      </div>

      {/* Updates */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Archive aria-hidden className="size-4 text-primary" />
          {t('settings.backupSection')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('settings.backupHint')}</p>
        {/* Same store, same Rust commands as Windows Optimizer — this is a
            second entry point, not a second backup system. */}
        <RestorePanel compact />
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <RefreshCw aria-hidden className="size-4 text-primary" />
          {t('settings.updates')}
        </h2>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(e) => setAutoUpdate(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">{t('settings.autoUpdate')}</span>
            <span className="block text-xs text-muted-foreground">{t('settings.autoUpdateHint')}</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" size="sm" disabled={checkingUpdate} onClick={() => void onCheckUpdate()}>
            {checkingUpdate ? <Loader2 aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
            {t('settings.checkUpdate')}
          </Button>
          {updateMsg && <span className="text-xs text-muted-foreground">{updateMsg}</span>}
        </div>
      </section>

      {/* About */}
      <section className="space-y-1.5 rounded-xl border border-border bg-card p-5 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          {t('settings.aboutSection')}
        </h2>
        <p className="text-muted-foreground">{t('settings.version', { version: appVersion })}</p>
        <p className="text-muted-foreground">{t('about.tagline')}</p>
      </section>
    </div>
  );
}
