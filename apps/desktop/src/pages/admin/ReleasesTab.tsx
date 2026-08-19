import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { errMessage, iconBtnClass, inputClass, LoadingState, ErrorState, EmptyState, primaryBtnClass, dangerIconBtnClass, TableWrap } from './shared';

export default function ReleasesTab() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [version, setVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    api
      .adminAppVersions()
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
    if (!version.trim() || !downloadUrl.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await api.adminCreateAppVersion({
        version: version.trim(),
        downloadUrl: downloadUrl.trim(),
        channel,
        releaseNotes: releaseNotes.trim() || undefined,
      });
      await api.adminReconcileLatestVersion(String(created.id));
      setVersion('');
      setDownloadUrl('');
      setReleaseNotes('');
      load();
    } catch (err) {
      setActionError(errMessage(err, t('common.error')));
    } finally {
      setCreating(false);
    }
  }

  async function handleMarkLatest(row: Record<string, unknown>) {
    const id = String(row.id);
    setBusyId(id);
    setActionError(null);
    try {
      await api.adminReconcileLatestVersion(id);
      load();
    } catch (err) {
      setActionError(errMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row: Record<string, unknown>) {
    const id = String(row.id);
    if (!window.confirm(t('admin.confirmDeleteRelease', { version: String(row.version) }))) return;
    setBusyId(id);
    setActionError(null);
    try {
      await api.adminDeleteAppVersion(id);
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
      <p className="text-xs text-muted-foreground">{t('admin.releasesNote')}</p>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
        <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.1.0" dir="ltr" className={`${inputClass} w-24`} />
        <input
          value={downloadUrl}
          onChange={(e) => setDownloadUrl(e.target.value)}
          placeholder="https://.../pcmax-setup.exe"
          dir="ltr"
          className={`${inputClass} min-w-64 flex-1`}
        />
        <select value={channel} onChange={(e) => setChannel(e.target.value as 'stable' | 'beta')} className={inputClass}>
          <option value="stable">stable</option>
          <option value="beta">beta</option>
        </select>
        <input value={releaseNotes} onChange={(e) => setReleaseNotes(e.target.value)} placeholder={t('admin.releaseNotes')} className={`${inputClass} min-w-48`} />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating || !version.trim() || !downloadUrl.trim()}
          className={primaryBtnClass}
        >
          {creating ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Plus aria-hidden className="size-3.5" />}
          {t('admin.publishRelease')}
        </button>
      </div>
      {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      {rows.length === 0 ? (
        <EmptyState message={t('admin.noReleases')} />
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">{t('admin.version')}</th>
                <th className="px-4 py-3">{t('admin.channel')}</th>
                <th className="px-4 py-3">{t('admin.latest')}</th>
                <th className="px-4 py-3">{t('admin.released')}</th>
                <th className="px-4 py-3 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = String(row.id);
                return (
                  <tr key={id} className="border-b border-border/50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-medium" dir="ltr">{String(row.version)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{String(row.channel)}</td>
                    <td className="px-4 py-3">
                      {row.isLatest ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                          <Star aria-hidden className="size-3" /> {t('admin.latest')}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{row.releasedAt ? new Date(String(row.releasedAt)).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleMarkLatest(row)}
                          disabled={busyId === id}
                          title={t('admin.recomputeLatest')}
                          aria-label={t('admin.recomputeLatest')}
                          className={iconBtnClass}
                        >
                          {busyId === id ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Star aria-hidden className="size-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row)}
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
