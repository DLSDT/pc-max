import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Database, Globe, RefreshCw, Trash2 } from 'lucide-react';
import { applyDirection } from '@/i18n';
import { cache } from '@/lib/cache';
import { config } from '@/lib/config';
import { runSync } from '@/lib/sync';
import { useUi } from '@/store/ui';
import { Button, Spinner } from '@/components/ui';
import { formatDateTime } from '@/lib/labels';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fa', label: 'فارسی' },
] as const;

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const language = useUi((s) => s.language);
  const setLanguage = useUi((s) => s.setLanguage);
  const setSyncStatus = useUi((s) => s.setSyncStatus);

  const [syncing, setSyncing] = useState(false);
  const [cleared, setCleared] = useState(false);

  async function onSyncNow() {
    setSyncing(true);
    setSyncStatus('syncing');
    const result = await runSync();
    setSyncStatus(result.offline ? 'offline' : 'online');
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

  const lastSync = cache.getLastSync();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>

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

      {/* Sync */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <RefreshCw aria-hidden className="size-4 text-primary" />
          Sync
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
        <p className="text-muted-foreground">{t('settings.version', { version: config.appVersion })}</p>
        <p className="text-muted-foreground">{t('about.tagline')}</p>
      </section>
    </div>
  );
}
