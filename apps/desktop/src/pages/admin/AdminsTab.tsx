import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Ban, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { errMessage, iconBtnClass, inputClass, LoadingState, ErrorState, EmptyState, primaryBtnClass, TableWrap } from './shared';

const ROLES = ['viewer', 'editor', 'admin', 'super_admin'] as const;

export default function AdminsTab() {
  const { t } = useTranslation();
  const currentUser = useAuth((s) => s.user);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('editor');
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    api
      .adminAdmins()
      .then((res) => {
        setRows(res.data ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(errMessage(err, t('common.error')));
        setLoading(false);
      });
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!email.trim() || !name.trim() || password.length < 7) return;
    setCreating(true);
    setActionError(null);
    try {
      await api.adminCreateAdmin({ email: email.trim(), name: name.trim(), password, role });
      setEmail('');
      setName('');
      setPassword('');
      load();
    } catch (err) {
      setActionError(errMessage(err, t('common.error')));
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(row: Record<string, unknown>) {
    const id = String(row.id);
    setBusyId(id);
    setActionError(null);
    try {
      await api.adminUpdateAdmin(id, { isActive: !row.isActive });
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
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" dir="ltr" className={inputClass} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('admin.name')} className={inputClass} />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('admin.passwordMin')}
          type="password"
          dir="ltr"
          className={inputClass}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])} className={inputClass}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating || !email.trim() || !name.trim() || password.length < 7}
          className={primaryBtnClass}
        >
          {creating ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Plus aria-hidden className="size-3.5" />}
          {t('admin.addAdmin')}
        </button>
      </div>
      {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      {rows.length === 0 ? (
        <EmptyState message={t('admin.noAdmins')} />
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">{t('admin.email')}</th>
                <th className="px-4 py-3">{t('admin.name')}</th>
                <th className="px-4 py-3">{t('admin.role')}</th>
                <th className="px-4 py-3">{t('admin.status')}</th>
                <th className="px-4 py-3 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = String(row.id);
                const active = row.isActive !== false;
                const isSelf = currentUser?.id === id;
                const label = isSelf ? t('admin.cannotDeactivateSelf') : active ? t('admin.deactivate') : t('admin.activate');
                return (
                  <tr key={id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 font-medium" dir="ltr">{String(row.email)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{String(row.name)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{String(row.role)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                        {active ? t('admin.stateActive') : t('admin.stateInactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => void toggleActive(row)}
                          disabled={busyId === id || isSelf}
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
