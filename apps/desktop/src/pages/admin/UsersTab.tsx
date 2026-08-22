import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Ban, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { errMessage, iconBtnClass, LoadingState, ErrorState, EmptyState, TableWrap } from './shared';

export default function UsersTab() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api
      .adminUsers()
      .then((res) => {
        setUsers(res.data ?? []);
        setTotal(res.total ?? 0);
        setLoading(false);
      })
      .catch((err) => {
        setError(errMessage(err, t('common.error')));
        setLoading(false);
      });
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleStatus(u: Record<string, unknown>) {
    const id = String(u.id);
    const next = u.status === 'active' ? 'suspended' : 'active';
    setBusyId(id);
    setActionError(null);
    try {
      await api.adminUpdateUserStatus(id, next);
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
      {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      <p className="text-sm text-muted-foreground">{t('admin.usersCount', { count: total })}</p>
      {users.length === 0 ? (
        <EmptyState message={t('admin.noUsers')} />
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">{t('admin.emailOrPhone')}</th>
                <th className="px-4 py-3">{t('admin.username')}</th>
                <th className="px-4 py-3">{t('admin.role')}</th>
                <th className="px-4 py-3">{t('admin.status')}</th>
                <th className="px-4 py-3 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const id = String(u.id);
                const active = u.status === 'active';
                const isAdmin = u.role === 'admin';
                const label = isAdmin
                  ? t('admin.cannotModifyAdmin')
                  : active
                    ? t('admin.suspend')
                    : t('admin.activate');
                return (
                  <tr key={id} className="border-b border-border/50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-medium" dir="ltr">
                      {/* Device-only rows have no email or phone at all — every
                          desktop install creates one. Rendering a bare dash for
                          them makes a legitimate anonymous account look like a
                          broken record. */}
                      {u.email ? (
                        String(u.email)
                      ) : u.phone ? (
                        String(u.phone)
                      ) : (
                        <span className="text-xs font-normal text-muted-foreground" dir="auto">
                          {t('admin.anonymousDevice')}
                          {u.deviceId ? ` · ${String(u.deviceId).slice(0, 8)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{String(u.username ?? '—')}</td>
                    <td className="px-4 py-3 text-muted-foreground">{String(u.role ?? 'user')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                        {String(u.status ?? 'active')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => void toggleStatus(u)}
                          disabled={busyId === id || isAdmin}
                          title={label}
                          aria-label={label}
                          className={iconBtnClass}
                        >
                          {busyId === id ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : active ? <Ban aria-hidden className="size-3.5" /> : <CheckCircle2 aria-hidden className="size-3.5" />}
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
