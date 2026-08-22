import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUp, CloudOff, Loader2, Search, Shield, UserRound, Wifi, WifiOff } from 'lucide-react';
import { useUi, type SyncStatus } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { useAdminAuth } from '@/store/adminAuth';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Visual + label mapping for the truthful connectivity state. */
function statusUi(status: SyncStatus, t: (k: string) => string) {
  switch (status) {
    case 'offline':
      return {
        icon: <WifiOff aria-hidden className="size-3.5" />,
        label: t('header.offline'),
        cls: 'border-destructive/30 bg-destructive/10 text-destructive',
      };
    case 'api-unavailable':
      return {
        icon: <CloudOff aria-hidden className="size-3.5" />,
        label: t('header.apiUnavailable'),
        cls: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
      };
    case 'syncing':
      return {
        icon: <Loader2 aria-hidden className="size-3.5 animate-spin" />,
        label: t('header.syncing'),
        cls: 'border-border bg-secondary text-muted-foreground',
      };
    default:
      return {
        icon: <Wifi aria-hidden className="size-3.5" />,
        label: t('header.online'),
        cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
      };
  }
}

export default function Header() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const syncStatus = useUi((s) => s.syncStatus);
  const updateAvailable = useUi((s) => s.updateAvailable);
  const user = useAuth((s) => s.user);
  const admin = useAdminAuth((s) => s.admin);

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
          title={statusUi(syncStatus, t).label}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
            statusUi(syncStatus, t).cls,
          )}
        >
          {statusUi(syncStatus, t).icon}
          <span className="hidden sm:inline">{statusUi(syncStatus, t).label}</span>
        </span>

        {admin ? (
          <Link
            to="/admin"
            title={admin.name ?? admin.email}
            className="flex h-9 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <Shield aria-hidden className="size-4" />
            <span className="hidden max-w-32 truncate md:inline" dir="ltr">{admin.name ?? admin.email}</span>
          </Link>
        ) : user ? (
          <Link
            to="/subscription"
            title={user.email ?? user.phone ?? ''}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <UserRound aria-hidden className="size-4 text-primary" />
            <span className="hidden max-w-32 truncate md:inline" dir="ltr">{user.email ?? user.phone}</span>
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
      </div>
    </header>
  );
}
