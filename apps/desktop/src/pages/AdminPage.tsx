import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminAuth } from '@/store/adminAuth';
import {
  Shield,
  Users,
  Gamepad2,
  Settings,
  Loader2,
  LogOut,
  Package,
  LayoutDashboard,
  SlidersHorizontal,
  Shapes,
  Rocket,
  UserCog,
  ScrollText,
  Bug,
} from 'lucide-react';
import { errMessage, iconBtnClass, inputClass, primaryBtnClass } from './admin/shared';
import DashboardTab from './admin/DashboardTab';
import GamesTab from './admin/GamesTab';
import ProfilesTab from './admin/ProfilesTab';
import PackagesTab from './admin/PackagesTab';
import TaxonomyTab from './admin/TaxonomyTab';
import ReleasesTab from './admin/ReleasesTab';
import AdminsTab from './admin/AdminsTab';
import UsersTab from './admin/UsersTab';
import AuditTab from './admin/AuditTab';
import CrashesTab from './admin/CrashesTab';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SettingsTab from './admin/SettingsTab';

type AdminTab = 'dashboard' | 'games' | 'profiles' | 'packages' | 'taxonomy' | 'releases' | 'admins' | 'users' | 'audit' | 'crashes' | 'settings';

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
  { key: 'crashes', i18nKey: 'admin.tabCrashes', icon: <Bug className="size-4" /> },
  { key: 'settings', i18nKey: 'admin.tabSettings', icon: <Settings className="size-4" /> },
];

function AdminLoginForm() {
  const { t } = useTranslation();
  const login = useAdminAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errMessage(err, t('admin.loginError')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <Shield className="size-12 text-primary" />
      <p className="text-lg font-semibold">{t('admin.loginTitle')}</p>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex w-full max-w-xs flex-col gap-3 text-left">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('admin.loginEmail')}
          dir="ltr"
          required
          className={inputClass}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('admin.loginPassword')}
          dir="ltr"
          required
          className={inputClass}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button type="submit" disabled={submitting} className={`${primaryBtnClass} justify-center`}>
          {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t('admin.loginButton')}
        </button>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const { t } = useTranslation();
  const admin = useAdminAuth((s) => s.admin);
  const ready = useAdminAuth((s) => s.ready);
  const restore = useAdminAuth((s) => s.restore);
  const [tab, setTab] = useState<AdminTab>('dashboard');

  useEffect(() => {
    void restore();
  }, [restore]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!admin) return <AdminLoginForm />;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('admin.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.subtitle')}</p>
      </header>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="size-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{admin.name ?? admin.email}</p>
            <p className="text-sm capitalize text-muted-foreground">{admin.role}</p>
          </div>
        </div>
        <button type="button" onClick={() => void useAdminAuth.getState().logout()} className={iconBtnClass} title={t('admin.signOut')}>
          <LogOut className="size-3.5" />
        </button>
      </div>

      {/* Radix tabs give proper roving-tabindex + arrow-key navigation across
          this many tabs, which the previous plain buttons did not. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
        <TabsList variant="button" size="sm" className="flex-wrap rounded-lg border border-border bg-card p-1" aria-label={t('admin.title')}>
          {TABS.map((tb) => (
            <TabsTrigger key={tb.key} value={tb.key}>
              {tb.icon}
              {t(tb.i18nKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'games' && <GamesTab />}
      {tab === 'profiles' && <ProfilesTab />}
      {tab === 'packages' && <PackagesTab />}
      {tab === 'taxonomy' && <TaxonomyTab />}
      {tab === 'releases' && <ReleasesTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'admins' && <AdminsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'crashes' && <CrashesTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
