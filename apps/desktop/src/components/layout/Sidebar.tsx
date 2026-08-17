import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Gamepad2,
  Heart,
  Home,
  Info,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useUi } from '@/store/ui';
import { cn } from '@/lib/utils';

const NAV_ITEMS: { to: string; key: string; icon: typeof Home; end?: boolean }[] = [
  { to: '/', key: 'sidebar.home', icon: Home, end: true },
  { to: '/games', key: 'sidebar.games', icon: Gamepad2 },
  { to: '/categories', key: 'sidebar.categories', icon: LayoutGrid },
  { to: '/recommended', key: 'sidebar.recommended', icon: Sparkles },
  { to: '/recently-viewed', key: 'sidebar.recentlyViewed', icon: Clock },
  { to: '/favorites', key: 'sidebar.favorites', icon: Heart },
  { to: '/settings', key: 'sidebar.settings', icon: Settings },
  { to: '/about', key: 'sidebar.about', icon: Info },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);

  return (
    <aside
      aria-label="Primary"
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-card/50 backdrop-blur transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Brand */}
      <div className={cn('flex h-16 items-center gap-3 border-b border-border px-4', collapsed && 'justify-center px-2')}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-glow-sm [&_svg]:size-5">
          <Gamepad2 aria-hidden />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">Game Optimization</p>
            <p className="truncate text-[11px] font-medium uppercase tracking-widest text-primary">Hub</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className={cn('mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground', collapsed && 'sr-only')}>
          {t('sidebar.library')}
        </p>
        {NAV_ITEMS.map(({ to, key, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? t(key) : undefined}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-muted-foreground',
                collapsed && 'justify-center px-0',
              )
            }
          >
            <Icon aria-hidden className="size-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{t(key)}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={t('sidebar.collapse')}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? <PanelLeftOpen aria-hidden className="size-[18px]" /> : <PanelLeftClose aria-hidden className="size-[18px]" />}
          {!collapsed && <span>{t('sidebar.collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}
