import { Fragment, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/labels';
import { errMessage, iconBtnClass, dangerIconBtnClass, LoadingState, ErrorState, EmptyState, TableWrap } from './shared';

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export default function CrashesTab() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminClientErrors({ resolved: showResolved ? 'true' : 'false', limit: '100' });
      setRows(res.data ?? []);
      setError(null);
    } catch (err) {
      setError(errMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [showResolved, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('admin.crashesCount', { count: rows.length })}</p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          {t('admin.showResolved')}
        </label>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState message={showResolved ? t('admin.noResolvedCrashes') : t('admin.noCrashes')} />
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs text-muted-foreground">
                <th className="px-3 py-2 text-start">{t('admin.crashMessage')}</th>
                <th className="px-3 py-2 text-start">{t('admin.crashRoute')}</th>
                <th className="px-3 py-2 text-start">{t('admin.crashVersion')}</th>
                <th className="px-3 py-2 text-start">{t('admin.crashCount')}</th>
                <th className="px-3 py-2 text-start">{t('admin.crashLastSeen')}</th>
                <th className="px-3 py-2 text-end">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = str(r.id);
                const isOpen = expanded === id;
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-border/60">
                      <td className="max-w-md px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : id)}
                          className="truncate text-start font-medium text-foreground hover:text-primary"
                          dir="ltr"
                          title={str(r.message)}
                        >
                          {str(r.message)}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground" dir="ltr">{str(r.route) || '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground" dir="ltr">{str(r.appVersion) || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{String(r.occurrences ?? 1)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTime(str(r.lastSeenAt))}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            disabled={busyId === id}
                            title={r.resolved ? t('admin.markUnresolved') : t('admin.markResolved')}
                            onClick={() => void run(id, () => api.adminResolveClientError(id, !r.resolved))}
                            className={iconBtnClass}
                          >
                            {r.resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === id}
                            title={t('common.delete')}
                            onClick={() => {
                              if (window.confirm(t('admin.confirmDeleteCrash'))) void run(id, () => api.adminDeleteClientError(id));
                            }}
                            className={dangerIconBtnClass}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border/60 bg-secondary/30">
                        <td colSpan={6} className="px-3 py-3">
                          <pre dir="ltr" className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                            {str(r.stack) || t('admin.noStack')}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
