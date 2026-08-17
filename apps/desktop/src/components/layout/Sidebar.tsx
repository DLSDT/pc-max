import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Gamepad2,
  Heart,
  History,
  Home,
  Info,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useUi } from '@/store/ui';
import { cn } from '@/lib/utils';

type Icon = typeof Home;

const PRIMARY: { to: string; i18nKey: string; icon: Icon; end?: boolean }[] = [
  { to: '/', i18nKey: 'sidebar.dashboard', icon: Home, end: true },
  { to: '/library', i18nKey: 'sidebar.gameOptimizer', icon: Gamepad2 },
  { to: '/windows-optimizer', i18nKey: 'sidebar.windowsOptimizer', icon: Wrench },
  { to: '/history', i18nKey: 'sidebar.history', icon: History },
  { to: '/settings', i18nKey: 'sidebar.settings', icon: Settings },
];

const SECONDARY: { to: string; i18nKey: string; icon: Icon }[] = [
  { to: '/games', i18nKey: 'sidebar.games', icon: LayoutGrid },
  { to: '/categories', i18nKey: 'sidebar.categories', icon: Shapes },
  { to: '/favorites', i18nKey: 'sidebar.favorites', icon: Heart },
  { to: '/recently-viewed', i18nKey: 'sidebar.recentlyViewed', icon: Clock },
  { to: '/recommended', i18nKey: 'sidebar.recommended', icon: Sparkles },
];

function NavLinkItem({ to, i18nKey, icon: Icon, end, collapsed }: { to: string; i18nKey: string; icon: Icon; end?: boolean; collapsed: boolean }) {
  const { t } = useTranslation();
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? t(i18nKey) : undefined}
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
      {!collapsed && <span className="truncate">{t(i18nKey)}</span>}
    </NavLink>
  );
}

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
        <img
          src="/icon.png"
          alt={t('appName')}
          className="size-9 shrink-0 rounded-lg object-contain"
          draggable={false}
        />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight tracking-tight">{t('appName')}</p>
            <p className="truncate text-[11px] font-medium text-muted-foreground">{t('tagline')}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          <p className={cn('mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground', collapsed && 'sr-only')}>
            {t('sidebar.main')}
          </p>
          {PRIMARY.map((item) => (
            <NavLinkItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </div>

        <div className="space-y-1">
          <p className={cn('mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground', collapsed && 'sr-only')}>
            {t('sidebar.library')}
          </p>
          {SECONDARY.map((item) => (
            <NavLinkItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      {/* Footer: About */}
      <div className="border-t border-border p-3">
        <NavLinkItem to="/about" i18nKey="sidebar.about" icon={Info} collapsed={collapsed} />
      </div>

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
