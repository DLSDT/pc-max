import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/store/auth';
import {
  Shield,
  Users,
  Gamepad2,
  Settings,
  AlertCircle,
  Package,
  LayoutDashboard,
  SlidersHorizontal,
  Shapes,
  Rocket,
  UserCog,
  ScrollText,
} from 'lucide-react';
import DashboardTab from './admin/DashboardTab';
import GamesTab from './admin/GamesTab';
import ProfilesTab from './admin/ProfilesTab';
import PackagesTab from './admin/PackagesTab';
import TaxonomyTab from './admin/TaxonomyTab';
import ReleasesTab from './admin/ReleasesTab';
import AdminsTab from './admin/AdminsTab';
import UsersTab from './admin/UsersTab';
import AuditTab from './admin/AuditTab';
import SettingsTab from './admin/SettingsTab';

type AdminTab = 'dashboard' | 'games' | 'profiles' | 'packages' | 'taxonomy' | 'releases' | 'admins' | 'users' | 'audit' | 'settings';

const TABS: { key: AdminTab; i18nKey: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', i18nKey: 'admin.tabDashboard', icon: <LayoutDashboard className="size-4" /> },
  { key: 'games', i18nKey: 'admin.tabGames', icon: <Gamepad2 className="size-4" /> },
  { key: 'profiles', i18nKey: 'admin.tabProfiles', icon: <SlidersHorizontal className="size-4" /> },
  { key: 'packages', i18nKey: 'admin.tabPackages', icon: <Package className="size-4" /> },
  { key: 'taxonomy', i18nKey: 'admin.tabTaxonomy', icon: <Shapes className="size-4" /> },
  { key: 'releases', i18nKey: 'admin.tabReleases', icon: <Rocket className="size-4" /> },
  { key: 'users', i18nKey: 'admin.tabUsers', icon: <Users className="size-4" /> },
  { key: 'admins', i18nKey: 'admin.tabAdmins', icon: <UserCog className="size-4" /> },
  { key: 'audit', i18nKey: 'admin.tabAudit', icon: <ScrollText className="size-4" /> },
  { key: 'settings', i18nKey: 'admin.tabSettings', icon: <Settings className="size-4" /> },
];

export default function AdminPage() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<AdminTab>('dashboard');

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-lg font-semibold">{t('admin.accessDenied')}</p>
        <p className="text-sm text-muted-foreground">{t('admin.accessDeniedDesc')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('admin.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.subtitle')}</p>
      </header>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="size-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{user.username ?? user.email}</p>
            <p className="text-sm capitalize text-muted-foreground">{user.role}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1" role="tablist" aria-label={t('admin.title')}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === tb.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {tb.icon}
            {t(tb.i18nKey)}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'games' && <GamesTab />}
      {tab === 'profiles' && <ProfilesTab />}
      {tab === 'packages' && <PackagesTab />}
      {tab === 'taxonomy' && <TaxonomyTab />}
      {tab === 'releases' && <ReleasesTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'admins' && <AdminsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
