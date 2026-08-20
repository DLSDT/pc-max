import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, BadgeCheck, Check, Database, Globe, Loader2, LogOut, Moon, RefreshCw, ShieldCheck, Sun, Trash2, UserRound } from 'lucide-react';
import { applyDirection } from '@/i18n';
import { api } from '@/lib/api';
import { cache } from '@/lib/cache';
import { config, getRuntimeAppVersion } from '@/lib/config';
import { applyTheme } from '@/lib/theme';
import { runSync } from '@/lib/sync';
import { getSubscription } from '@/lib/subscription';
import { createBackup, deleteBackup, getApplied, listBackups, restoreBackup, type BackupSnapshot } from '@/lib/backup';
import { useAuth } from '@/store/auth';
import { useUi } from '@/store/ui';
import { Badge, Button, Spinner } from '@/components/ui';
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
  const setSyncStatus = useUi((s) => s.setSyncStatus);
  const user = useAuth((s) => s.user);
  const authReady = useAuth((s) => s.ready);
  const logout = useAuth((s) => s.logout);

  const [syncing, setSyncing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [subActive, setSubActive] = useState(false);
  const [subChecked, setSubChecked] = useState(false);
  const [backups, setBackups] = useState<BackupSnapshot[]>(() => listBackups());
  const [appliedCount, setAppliedCount] = useState(() => getApplied().length);
  const [backingUp, setBackingUp] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>(config.appVersion);
  const [backupError, setBackupError] = useState<string | null>(null);

  function refreshBackups() {
    setBackups(listBackups());
    setAppliedCount(getApplied().length);
  }

  async function onBackupNow() {
    setBackingUp(true);
    setBackupMsg(null);
    setBackupError(null);
    createBackup();
    refreshBackups();
    setBackupMsg(t('backup.created'));
    setBackingUp(false);
    setTimeout(() => setBackupMsg(null), 3000);
  }

  async function onRestore(id: string) {
    setRestoringId(id);
    setBackupMsg(null);
    setBackupError(null);
    try {
      const result = await restoreBackup(id);
      refreshBackups();
      setBackupMsg(
        result.missing.length
          ? t('backup.restoredWithMissing', { count: result.missing.length })
          : t('backup.restored', { count: result.restored.length }),
      );
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : t('backup.error'));
    } finally {
      setRestoringId(null);
    }
  }

  function onDeleteBackup(id: string) {
    deleteBackup(id);
    refreshBackups();
  }

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

  async function onSignOut() {
    await logout();
    await queryClient.invalidateQueries();
    navigate('/');
  }

  async function onSyncNow() {
    setSyncing(true);
    setSyncStatus('syncing');
    const result = await runSync();
    setSyncStatus(result.offline ? 'offline' : result.apiUnavailable ? 'api-unavailable' : 'online');
    setSyncing(false);
    await queryClient.invalidateQueries();
  }

  async function onClearCache() {
    cache.clear();
    setCleared(true);
    setSyncStatus('idle');
    await queryClient.invalidateQueries();
    queryClient.removeQueries();
    setTimeout(() => setCleared(false), 2500);
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

  const lastSync = cache.getLastSync();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>

      {/* Account */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UserRound aria-hidden className="size-4 text-primary" />
          {t('auth.account')}
        </h2>
        {!authReady ? (
          // Session restore (httpOnly refresh cookie) hasn't resolved yet —
          // don't flash "sign in required" at an actually-signed-in user.
          <div className="flex items-center py-2">
            <Spinner />
          </div>
        ) : user ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium" dir="ltr">{user.phone ?? user.email}</span>
              <Badge variant={subActive ? 'success' : 'secondary'}>
                <ShieldCheck aria-hidden className="mr-1 size-3" />
                {subChecked
                  ? subActive
                    ? t('subscription.active')
                    : t('subscription.noActive')
                  : t('common.loading')}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Link to="/subscription" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent">
                <BadgeCheck aria-hidden className="size-3.5 text-primary" />
                {t('subscription.title')}
              </Link>
              <Button variant="outline" size="sm" onClick={() => void onSignOut()}>
                <LogOut aria-hidden />
                {t('auth.signOut')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('auth.signInRequired')}</p>
            <Button size="sm" onClick={() => navigate('/login')}>
              <UserRound aria-hidden />
              {t('auth.signIn')}
            </Button>
          </div>
        )}
      </section>

      {/* Theme */}
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

      {/* Language */}
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

      {/* Backups */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Archive aria-hidden className="size-4 text-primary" />
          {t('backup.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t('backup.hint', { count: appliedCount })}
        </p>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => void onBackupNow()} disabled={backingUp || appliedCount === 0}>
            {backingUp ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Archive aria-hidden />}
            {t('backup.create')}
          </Button>
          {backupMsg && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <Check aria-hidden className="size-3" />
              {backupMsg}
            </span>
          )}
          {backupError && <span className="text-xs text-destructive">{backupError}</span>}
        </div>
        {backups.length > 0 && (
          <ul className="space-y-2 pt-1">
            {backups.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(b.createdAt)} · {b.applied.length} {t('backup.packages')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void onRestore(b.id)} disabled={restoringId === b.id}>
                    {restoringId === b.id ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <RefreshCw aria-hidden />}
                    {t('backup.restore')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDeleteBackup(b.id)} aria-label={t('backup.delete')}>
                    <Trash2 aria-hidden className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sync */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <RefreshCw aria-hidden className="size-4 text-primary" />
          {t('settings.sync')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {lastSync ? t('settings.syncedAt', { time: formatDateTime(lastSync) }) : t('common.loading')}
        </p>
        <Button size="sm" onClick={() => void onSyncNow()} disabled={syncing}>
          {syncing ? <Spinner /> : <RefreshCw aria-hidden />}
          {t('settings.syncNow')}
        </Button>
      </section>

      {/* Cache */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Database aria-hidden className="size-4 text-primary" />
          {t('settings.cache')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('settings.cacheHint')}</p>
        <div className="flex items-center gap-3">
          <Button variant="destructive" size="sm" onClick={() => void onClearCache()}>
            <Trash2 aria-hidden />
            {t('settings.clearCache')}
          </Button>
          {cleared && <span className="text-xs text-emerald-400">{t('settings.clearCacheDone')}</span>}
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
