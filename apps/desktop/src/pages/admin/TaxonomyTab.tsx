import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { errMessage, inputClass, LoadingState, ErrorState, EmptyState, primaryBtnClass, dangerIconBtnClass, TableWrap } from './shared';

type Row = Record<string, unknown>;

interface EntityConfig {
  titleKey: string;
  list: () => Promise<{ data: Row[] }>;
  create: (input: Record<string, unknown>) => Promise<Row>;
  update: (id: string, patch: Record<string, unknown>) => Promise<Row>;
  remove: (id: string) => Promise<{ ok: boolean }>;
  extraField?: 'description' | 'sortOrder';
}

function EntitySection({ config }: { config: EntityConfig }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    config
      .list()
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
    if (!slug.trim() || !name.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const input: Record<string, unknown> = { slug: slug.trim(), name: name.trim() };
      if (config.extraField === 'description' && extra.trim()) input.description = extra.trim();
      if (config.extraField === 'sortOrder') input.sortOrder = Number(extra) || 0;
      await config.create(input);
      setSlug('');
      setName('');
      setExtra('');
      load();
    } catch (err) {
      setActionError(errMessage(err, t('common.error')));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(row: Row) {
    const id = String(row.id);
    if (!window.confirm(t('admin.confirmDeleteNamed', { name: String(row.name) }))) return;
    setBusyId(id);
    setActionError(null);
    try {
      await config.remove(id);
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
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{t(config.titleKey)}</h3>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" dir="ltr" className={inputClass} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('admin.name')} className={inputClass} />
        {config.extraField === 'description' && (
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={t('admin.description')} className={inputClass} />
        )}
        {config.extraField === 'sortOrder' && (
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={t('admin.sortOrder')} type="number" className={`${inputClass} w-24`} />
        )}
        <button type="button" onClick={() => void handleCreate()} disabled={creating || !slug.trim() || !name.trim()} className={primaryBtnClass}>
          {creating ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Plus aria-hidden className="size-3.5" />}
          {t('admin.add')}
        </button>
      </div>
      {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      {rows.length === 0 ? (
        <EmptyState message={t('admin.nothingHere')} />
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{String(row.name)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground" dir="ltr">{String(row.slug)}</td>
                  {config.extraField === 'description' && (
                    <td className="px-4 py-2.5 text-muted-foreground">{row.description ? String(row.description) : '—'}</td>
                  )}
                  {config.extraField === 'sortOrder' && <td className="px-4 py-2.5 text-muted-foreground">{String(row.sortOrder ?? 0)}</td>}
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => void handleDelete(row)}
                      disabled={busyId === String(row.id)}
                      title={t('admin.delete')}
                      aria-label={t('admin.delete')}
                      className={dangerIconBtnClass}
                    >
                      {busyId === String(row.id) ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Trash2 aria-hidden className="size-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}

export default function TaxonomyTab() {
  return (
    <div className="space-y-8">
      <EntitySection
        config={{
          titleKey: 'admin.categoriesTitle',
          list: api.adminCategories,
          create: api.adminCreateCategory,
          update: api.adminUpdateCategory,
          remove: api.adminDeleteCategory,
          extraField: 'description',
        }}
      />
      <EntitySection
        config={{
          titleKey: 'admin.tagsTitle',
          list: api.adminTags,
          create: api.adminCreateTag,
          update: api.adminUpdateTag,
          remove: api.adminDeleteTag,
        }}
      />
      <EntitySection
        config={{
          titleKey: 'admin.optimizationCategoriesTitle',
          list: api.adminOptimizationCategories,
          create: api.adminCreateOptimizationCategory,
          update: api.adminUpdateOptimizationCategory,
          remove: api.adminDeleteOptimizationCategory,
          extraField: 'sortOrder',
        }}
      />
    </div>
  );
}
