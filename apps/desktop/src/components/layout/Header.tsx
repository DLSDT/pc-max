import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUp, CloudOff, Loader2, Menu, Search, Shield, UserRound, Wifi, WifiOff } from 'lucide-react';
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
  const setNavOpen = useUi((s) => s.setNavOpen);
  const user = useAuth((s) => s.user);
  const admin = useAdminAuth((s) => s.admin);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/games?q=${encodeURIComponent(q)}` : '/games');
    setQuery('');
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur sm:gap-4 sm:px-6">
      {/* The only way to the navigation once the sidebar becomes a drawer. */}
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        aria-label={t('sidebar.open')}
        className="-ms-1 shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </button>

      <form onSubmit={onSubmit} role="search" className="relative min-w-0 max-w-md flex-1">
        {/* Logical properties, not left/right: in Persian the field reads from
            the right and a magnifier pinned to the left sat on top of the text. */}
        <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('header.searchPlaceholder')}
          aria-label={t('header.searchPlaceholder')}
          className="ps-9"
        />
      </form>

      <div className="ms-auto flex items-center gap-2 sm:gap-3">
        {updateAvailable && (
          <Link
            to="/settings"
            title={t('header.updateAvailable')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20 sm:px-3"
          >
            <ArrowUp aria-hidden className="size-3.5" />
            <span className="hidden lg:inline">{t('header.updateAvailable')}</span>
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
