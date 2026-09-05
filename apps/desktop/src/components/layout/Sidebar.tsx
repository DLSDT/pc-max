import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Heart,
  Home,
  Info,
  Layers,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Wrench,
} from 'lucide-react';
import { useAdminAuth } from '@/store/adminAuth';
import { useUi } from '@/store/ui';
import { cn } from '@/lib/utils';

type Icon = typeof Home;

/** Dashboard → Multi Frame Generation → Optimised settings → Optimised Windows →
 * General Settings, in that exact order and wording (per spec). */
const PRIMARY: { to: string; i18nKey: string; icon: Icon; end?: boolean }[] = [
  { to: '/', i18nKey: 'sidebar.dashboard', icon: Home, end: true },
  { to: '/multi-frame-generation', i18nKey: 'sidebar.multiFrameGeneration', icon: Layers },
  { to: '/optimized-setting', i18nKey: 'sidebar.optimizedSetting', icon: SlidersHorizontal },
  { to: '/windows-optimizer', i18nKey: 'sidebar.windowsOptimizer', icon: Wrench },
  { to: '/settings', i18nKey: 'sidebar.settings', icon: Settings },
];

const SECONDARY: { to: string; i18nKey: string; icon: Icon }[] = [
  { to: '/games', i18nKey: 'sidebar.games', icon: LayoutGrid },
  { to: '/categories', i18nKey: 'sidebar.categories', icon: Tags },
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
          // Collapsing is a desktop-column affordance. Inside the narrow-screen
          // drawer there is room for the label and no way to expand it again,
          // so the collapsed styling is scoped to `lg:` rather than applied by
          // rendering a different tree.
          collapsed && 'lg:justify-center lg:px-0',
        )
      }
    >
      <Icon aria-hidden className="size-[18px] shrink-0" />
      <span className={cn('truncate', collapsed && 'lg:hidden')}>{t(i18nKey)}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);
  const navOpen = useUi((s) => s.navOpen);
  const setNavOpen = useUi((s) => s.setNavOpen);
  const isAdmin = useAdminAuth((s) => Boolean(s.admin));
  const { pathname } = useLocation();

  // Going somewhere closes the drawer. On a narrow screen it covers the page
  // it just navigated to, so leaving it open hides the result of the tap.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname, setNavOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen, setNavOpen]);

  return (
    <aside
      aria-label="Primary"
      // Below `lg` this is a drawer over the page, not a column beside it.
      // As a column it took 240 of a 375px screen and left the content 135px:
      // cards 77px wide, a search box 50px wide — a layout that technically did
      // not overflow and was unusable anyway.
      //
      // The collapse toggle only means anything in the column form, so its
      // width classes are all `lg:` — inside the drawer the sidebar is always
      // full width regardless of how it was left on the desktop.
      className={cn(
        'fixed inset-y-0 start-0 z-50 flex w-72 shrink-0 flex-col border-e border-border bg-card shadow-2xl',
        'transition-transform duration-200 ease-out',
        'lg:static lg:z-auto lg:w-60 lg:translate-x-0 lg:bg-card/50 lg:shadow-none lg:backdrop-blur lg:transition-[width]',
        collapsed && 'lg:w-16',
        // Off-canvas toward the edge it is anchored to, which flips with the
        // writing direction: Persian puts the sidebar on the right. Both states
        // name a transform rather than one of them being the absence of a
        // class — leaving it unset relies on every other rule that could set
        // one being absent too, and that is not a thing to rely on.
        navOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
      )}
    >
      {/* Brand */}
      <div className={cn('flex h-16 items-center gap-3 border-b border-border px-4', collapsed && 'lg:justify-center lg:px-2')}>
        <img
          src="/icon.png"
          alt={t('appName')}
          className="size-9 shrink-0 rounded-lg object-contain"
          draggable={false}
        />
        <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
          <p className="truncate text-sm font-bold leading-tight tracking-tight">{t('appName')}</p>
          <p className="truncate text-[11px] font-medium text-muted-foreground">{t('tagline')}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          <p className={cn('mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground', collapsed && 'lg:sr-only')}>
            {t('sidebar.main')}
          </p>
          {PRIMARY.map((item) => (
            <NavLinkItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </div>

        <div className="space-y-1">
          <p className={cn('mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground', collapsed && 'lg:sr-only')}>
            {t('sidebar.library')}
          </p>
          {SECONDARY.map((item) => (
            <NavLinkItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      {/* Footer: Admin (only once signed in as one — sign-in itself happens
          through the single login form, not a separate nav entry) + About */}
      <div className="space-y-1 border-t border-border p-3">
        {isAdmin && <NavLinkItem to="/admin" i18nKey="sidebar.admin" icon={Shield} collapsed={collapsed} />}
        <NavLinkItem to="/about" i18nKey="sidebar.about" icon={Info} collapsed={collapsed} />
      </div>

      {/* Collapse toggle — column form only. In the drawer there is no second
          state to collapse into, and a control that narrows a panel already
          covering the screen would just be confusing. */}
      <div className="hidden border-t border-border p-3 lg:block">
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
