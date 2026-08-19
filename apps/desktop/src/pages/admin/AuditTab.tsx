import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { errMessage, LoadingState, ErrorState, EmptyState, TableWrap } from './shared';

export default function AuditTab() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .adminAuditLogs({ limit: '50' })
      .then((res) => {
        if (!cancelled) {
          setRows(res.data ?? []);
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
  if (rows.length === 0) return <EmptyState message={t('admin.noAudit')} />;

  return (
    <TableWrap>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">{t('admin.when')}</th>
            <th className="px-4 py-3">{t('admin.adminCol')}</th>
            <th className="px-4 py-3">{t('admin.action')}</th>
            <th className="px-4 py-3">{t('admin.entity')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const admin = row.admin as { email?: string; name?: string } | null;
            return (
              <tr key={String(row.id)} className="border-b border-border/50 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                  {row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5" dir="ltr">{admin?.email ?? admin?.name ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-medium">{String(row.action)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {String(row.entityType)}
                  {row.entityId ? <span className="opacity-60"> · {String(row.entityId).slice(0, 8)}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
