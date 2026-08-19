import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Gamepad2, Layers, Eye, Package, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { errMessage, LoadingState, ErrorState } from './shared';

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div className="min-w-0">
        <p className="text-xl font-bold tabular-nums">{value.toLocaleString()}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardTab() {
  const { t } = useTranslation();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .adminDashboard()
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errMessage(err, t('common.error')));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const stats = data.stats as Record<string, number> | undefined;
  const topGames = (data.topGames as Record<string, unknown>[] | undefined) ?? [];
  const recentUpdates = (data.recentUpdates as Record<string, unknown>[] | undefined) ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Users className="size-5" />} label={t('admin.statTotalUsers')} value={stats?.totalUsers ?? 0} />
        <StatCard icon={<Users className="size-5" />} label={t('admin.statActiveUsers')} value={stats?.activeUsers7d ?? 0} />
        <StatCard icon={<Gamepad2 className="size-5" />} label={t('admin.statPublishedGames')} value={stats?.publishedGames ?? 0} />
        <StatCard icon={<Layers className="size-5" />} label={t('admin.statProfiles')} value={stats?.totalProfiles ?? 0} />
        <StatCard icon={<Eye className="size-5" />} label={t('admin.statViews')} value={stats?.totalViews ?? 0} />
        <StatCard icon={<Package className="size-5" />} label={t('admin.statAppVersions')} value={stats?.appVersions ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp aria-hidden className="size-4 text-primary" /> {t('admin.topGames')}
          </h3>
          {topGames.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('admin.noViews')}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {topGames.map((g) => (
                <li key={String(g.gameId)} className="flex items-center justify-between">
                  <span className="truncate">{String(g.name)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{String(g.views)} {t('admin.views')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">{t('admin.recentUpdates')}</h3>
          {recentUpdates.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('admin.noUpdates')}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {recentUpdates.map((g) => (
                <li key={String(g.id)} className="flex items-center justify-between">
                  <span className="truncate">{String(g.name)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {g.updatedAt ? new Date(String(g.updatedAt)).toLocaleDateString() : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
