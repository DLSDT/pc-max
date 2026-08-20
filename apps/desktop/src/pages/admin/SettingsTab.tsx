import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { errMessage, primaryBtnClass, LoadingState, ErrorState, EmptyState } from './shared';

export default function SettingsTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    api
      .adminSettings()
      .then((res) => {
        if (cancelled) return;
        const data = res.data ?? {};
        setSettings(data);
        setDrafts(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, JSON.stringify(v, null, 2)])));
        setLoading(false);
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

  async function handleSave(key: string) {
    setSavingKey(key);
    setRowError((r) => ({ ...r, [key]: '' }));
    try {
      const parsed = JSON.parse(drafts[key] ?? 'null');
      const res = await api.adminUpdateSettings({ [key]: parsed });
      setSettings(res.data ?? {});
    } catch (err) {
      setRowError((r) => ({ ...r, [key]: err instanceof SyntaxError ? t('admin.invalidJson') : errMessage(err, t('common.error')) }));
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const entries = Object.entries(settings);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('admin.settingsCount', { count: entries.length })}</p>
      {entries.length === 0 ? (
        <EmptyState message={t('admin.noSystemSettings')} />
      ) : (
        <div className="space-y-3">
          {entries.map(([key]) => (
            <div key={key} className="space-y-2 rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{key}</p>
                <button type="button" onClick={() => void handleSave(key)} disabled={savingKey === key} className={primaryBtnClass}>
                  {savingKey === key ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {t('common.save')}
                </button>
              </div>
              <textarea
                value={drafts[key] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                dir="ltr"
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
              />
              {rowError[key] && <p className="text-xs text-destructive">{rowError[key]}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
