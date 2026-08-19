import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { errMessage, iconBtnClass, dangerIconBtnClass, LoadingState, ErrorState, EmptyState, TableWrap } from './shared';

export default function PackagesTab() {
  const { t } = useTranslation();
  const [pkgs, setPkgs] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api
      .adminPackages()
      .then((res) => {
        setPkgs(res.data ?? []);
        setTotal(res.total ?? 0);
        setLoading(false);
      })
      .catch((err) => {
        setError(errMessage(err, t('common.error')));
        setLoading(false);
      });
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      load();
    } catch (err) {
      setActionError(errMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('admin.packagesNote')}</p>
      {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      <p className="text-sm text-muted-foreground">{t('admin.packagesCount', { count: total })}</p>
      {pkgs.length === 0 ? (
        <EmptyState message={t('admin.noPackages')} />
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">{t('admin.name')}</th>
                <th className="px-4 py-3">{t('admin.game')}</th>
                <th className="px-4 py-3">{t('admin.status')}</th>
                <th className="px-4 py-3 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pkgs.map((p) => {
                const id = String(p.id);
                const status = String(p.status ?? 'draft');
                return (
                  <tr key={id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 font-medium">{String(p.name ?? '—')}</td>
                    <td className="px-4 py-3 text-muted-foreground">{String(p.gameSlug ?? '—')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status === 'published' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {status !== 'published' && (
                          <button
                            type="button"
                            onClick={() => void run(id, () => api.adminPublishPackage(id))}
                            disabled={busyId === id}
                            title={t('admin.publish')}
                            aria-label={t('admin.publish')}
                            className={iconBtnClass}
                          >
                            {busyId === id ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Eye aria-hidden className="size-3.5" />}
                          </button>
                        )}
                        {status === 'published' && (
                          <button
                            type="button"
                            onClick={() => void run(id, () => api.adminArchivePackage(id))}
                            disabled={busyId === id}
                            title={t('admin.archive')}
                            aria-label={t('admin.archive')}
                            className={iconBtnClass}
                          >
                            {busyId === id ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <EyeOff aria-hidden className="size-3.5" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(t('admin.confirmDeletePackage'))) void run(id, () => api.adminDeletePackage(id));
                          }}
                          disabled={busyId === id}
                          title={t('admin.delete')}
                          aria-label={t('admin.delete')}
                          className={dangerIconBtnClass}
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
