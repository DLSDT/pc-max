import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Loader2, Search, Settings, UserRound, Wifi, WifiOff } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';

export default function Header() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const syncStatus = useUi((s) => s.syncStatus);
  const updateAvailable = useUi((s) => s.updateAvailable);
  const user = useAuth((s) => s.user);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/games?q=${encodeURIComponent(q)}` : '/games');
    setQuery('');
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background/70 px-6 backdrop-blur">
      <form onSubmit={onSubmit} role="search" className="relative max-w-md flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('header.searchPlaceholder')}
          aria-label={t('header.searchPlaceholder')}
          className="pl-9"
        />
      </form>

      <div className="ml-auto flex items-center gap-3">
        {updateAvailable && (
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            <ArrowUp aria-hidden className="size-3.5" />
            {t('header.updateAvailable')}
          </Link>
        )}

        <span
          role="status"
          title={
            syncStatus === 'offline'
              ? t('header.offline')
              : syncStatus === 'syncing'
                ? t('header.syncing')
                : t('header.online')
          }
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
            syncStatus === 'offline'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : syncStatus === 'syncing'
                ? 'border-border bg-secondary text-muted-foreground'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
          )}
        >
          {syncStatus === 'offline' ? (
            <WifiOff aria-hidden className="size-3.5" />
          ) : syncStatus === 'syncing' ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          ) : (
            <Wifi aria-hidden className="size-3.5" />
          )}
          <span className="hidden sm:inline">
            {syncStatus === 'offline' ? t('header.offline') : syncStatus === 'syncing' ? t('header.syncing') : t('header.online')}
          </span>
        </span>

        {user ? (
          <Link
            to="/subscription"
            title={user.phone ?? user.email ?? ''}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <UserRound aria-hidden className="size-4 text-primary" />
            <span className="hidden max-w-32 truncate md:inline" dir="ltr">{user.phone ?? user.email}</span>
          </Link>
        ) : (
          <Link
            to="/login"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <UserRound aria-hidden className="size-4" />
            {t('auth.signIn')}
          </Link>
        )}

        <Link
          to="/settings"
          aria-label={t('sidebar.settings')}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Settings aria-hidden className="size-[18px]" />
        </Link>
      </div>
    </header>
  );
}
