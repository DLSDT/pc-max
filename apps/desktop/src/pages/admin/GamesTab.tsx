import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2, Eye, EyeOff, Settings2, ArrowLeft, Image as ImageIcon, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { errMessage, iconBtnClass, inputClass, LoadingState, ErrorState, EmptyState, primaryBtnClass, dangerIconBtnClass, TableWrap } from './shared';

const STATUSES = ['draft', 'published', 'archived'] as const;
const IMAGE_TYPES = ['cover', 'background', 'logo', 'screenshot'] as const;
const LAUNCHERS = ['', 'steam', 'epic', 'gog', 'standalone'] as const;

export default function GamesTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (selectedId) return <GameEditor id={selectedId} onBack={() => setSelectedId(null)} />;
  return <GamesList onManage={setSelectedId} />;
}

function GamesList({ onManage }: { onManage: (id: string) => void }) {
  const { t } = useTranslation();
  const [games, setGames] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    api
      .adminGames()
      .then((res) => {
        setGames(res.data ?? []);
        setTotal(res.total ?? 0);
        setLoading(false);
      })
      .catch((err) => {
        setError(errMessage(err, t('common.error')));
        setLoading(false);
      });
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!name.trim() || !slug.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await api.adminCreateGame({ name: name.trim(), slug: slug.trim() });
      setName('');
      setSlug('');
      load();
      onManage(String(created.id));
    } catch (err) {
      setActionError(errMessage(err, t('common.error')));
    } finally {
      setCreating(false);
    }
  }

  async function togglePublish(game: Record<string, unknown>) {
    const id = String(game.id);
    const nextStatus = game.status === 'published' ? 'draft' : 'published';
    setBusyId(id);
    setActionError(null);
    try {
      await api.adminPublishGame(id, nextStatus);
      load();
    } catch (err) {
      setActionError(errMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(game: Record<string, unknown>) {
    const id = String(game.id);
    if (!window.confirm(t('admin.confirmDeleteGame', { name: String(game.name) }))) return;
    setBusyId(id);
    setActionError(null);
    try {
      await api.adminDeleteGame(id);
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
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('admin.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Cyberpunk 2077" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('admin.slug')}</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} dir="ltr" className={inputClass} placeholder="cyberpunk-2077" />
        </div>
        <button type="button" onClick={() => void handleCreate()} disabled={creating || !name.trim() || !slug.trim()} className={primaryBtnClass}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('admin.createGame')}
        </button>
      </div>

      {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      <p className="text-sm text-muted-foreground">{t('admin.gamesCount', { count: total })}</p>
      {games.length === 0 ? (
        <EmptyState message={t('admin.noGames')} />
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">{t('admin.name')}</th>
                <th className="px-4 py-3">{t('admin.slug')}</th>
                <th className="px-4 py-3">{t('admin.status')}</th>
                <th className="px-4 py-3 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => {
                const id = String(game.id);
                const published = game.status === 'published';
                return (
                  <tr key={id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 font-medium">{String(game.name ?? '—')}</td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">{String(game.slug ?? '—')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${published ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {String(game.status ?? 'draft')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => onManage(id)} title={t('admin.manage')} aria-label={t('admin.manage')} className={iconBtnClass}>
                          <Settings2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void togglePublish(game)}
                          disabled={busyId === id}
                          title={published ? t('admin.unpublish') : t('admin.publish')}
                          aria-label={published ? t('admin.unpublish') : t('admin.publish')}
                          className={iconBtnClass}
                        >
                          {busyId === id ? <Loader2 className="size-3.5 animate-spin" /> : published ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                        <button type="button" onClick={() => void handleDelete(game)} disabled={busyId === id} title={t('admin.delete')} aria-label={t('admin.delete')} className={dangerIconBtnClass}>
                          <Trash2 className="size-3.5" />
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

function GameEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [form, setForm] = useState<Record<string, unknown>>({});

  function load() {
    setLoading(true);
    api
      .adminGetGame(id)
      .then((res) => {
        setDetail(res);
        setForm({
          name: res.name ?? '',
          slug: res.slug ?? '',
          tagline: res.tagline ?? '',
          description: res.description ?? '',
          developer: res.developer ?? '',
          publisher: res.publisher ?? '',
          engine: res.engine ?? '',
          api: res.api ?? '',
          performanceRating: res.performanceRating ?? 50,
          featured: Boolean(res.featured),
          status: res.status ?? 'draft',
          steamAppId: res.steamAppId ?? '',
          epicAppId: res.epicAppId ?? '',
          launcher: res.launcher ?? '',
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(errMessage(err, t('common.error')));
        setLoading(false);
      });
  }

  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function setField(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const patch: Record<string, unknown> = { ...form };
      for (const k of ['tagline', 'description', 'developer', 'publisher', 'engine', 'api', 'steamAppId', 'epicAppId']) {
        if (patch[k] === '') patch[k] = null;
      }
      if (patch.launcher === '') patch.launcher = null;
      patch.performanceRating = Number(patch.performanceRating) || 0;
      await api.adminUpdateGame(id, patch);
      setSaveMsg(t('admin.saved'));
      load();
    } catch (err) {
      setSaveMsg(errMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!detail) return null;

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> {t('admin.backToGames')}
      </button>

      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">{t('admin.details')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('admin.name')}><input value={String(form.name ?? '')} onChange={(e) => setField('name', e.target.value)} className={inputClass} /></Field>
          <Field label={t('admin.slug')}><input value={String(form.slug ?? '')} onChange={(e) => setField('slug', e.target.value)} dir="ltr" className={inputClass} /></Field>
          <Field label={t('admin.developer')}><input value={String(form.developer ?? '')} onChange={(e) => setField('developer', e.target.value)} className={inputClass} /></Field>
          <Field label={t('admin.publisher')}><input value={String(form.publisher ?? '')} onChange={(e) => setField('publisher', e.target.value)} className={inputClass} /></Field>
          <Field label={t('admin.engine')}><input value={String(form.engine ?? '')} onChange={(e) => setField('engine', e.target.value)} className={inputClass} /></Field>
          <Field label={t('admin.graphicsApi')}><input value={String(form.api ?? '')} onChange={(e) => setField('api', e.target.value)} dir="ltr" className={inputClass} /></Field>
          <Field label={t('admin.performanceRating')}>
            <input type="number" min={0} max={100} value={String(form.performanceRating ?? 50)} onChange={(e) => setField('performanceRating', e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('admin.status')}>
            <select value={String(form.status ?? 'draft')} onChange={(e) => setField('status', e.target.value)} className={inputClass}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Steam App ID"><input value={String(form.steamAppId ?? '')} onChange={(e) => setField('steamAppId', e.target.value)} dir="ltr" className={inputClass} /></Field>
          <Field label="Epic App ID"><input value={String(form.epicAppId ?? '')} onChange={(e) => setField('epicAppId', e.target.value)} dir="ltr" className={inputClass} /></Field>
          <Field label={t('admin.launcher')}>
            <select value={String(form.launcher ?? '')} onChange={(e) => setField('launcher', e.target.value)} className={inputClass}>
              {LAUNCHERS.map((l) => <option key={l} value={l}>{l || '—'}</option>)}
            </select>
          </Field>
          <Field label={t('admin.featuredOnHome')}>
            <label className="flex h-8 items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(form.featured)} onChange={(e) => setField('featured', e.target.checked)} />
              {t('admin.featured')}
            </label>
          </Field>
        </div>
        <Field label={t('admin.tagline')}><input value={String(form.tagline ?? '')} onChange={(e) => setField('tagline', e.target.value)} className={`${inputClass} w-full`} /></Field>
        <Field label={t('admin.description')}>
          <textarea value={String(form.description ?? '')} onChange={(e) => setField('description', e.target.value)} rows={4} className={`${inputClass} w-full`} />
        </Field>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void handleSave()} disabled={saving} className={primaryBtnClass}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t('admin.saveChanges')}
          </button>
          {saveMsg && <span className="text-xs text-muted-foreground">{saveMsg}</span>}
        </div>
      </div>

      <ImagesSection gameId={id} images={(detail.images as Record<string, unknown>[]) ?? []} onChanged={load} />
      <RequirementsSection gameId={id} requirements={(detail.requirements as Record<string, unknown>[]) ?? []} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ImagesSection({ gameId, images, onChanged }: { gameId: string; images: Record<string, unknown>[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState<(typeof IMAGE_TYPES)[number]>('cover');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const contentType = file.type || 'image/png';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
        throw new Error(t('admin.imageTypeError'));
      }
      const { uploadUrl, objectKey } = await api.adminPresignUpload(type, contentType, file.size);
      await api.adminUploadFile(uploadUrl, file);
      await api.adminAddGameImage(gameId, { type, objectKey });
      onChanged();
    } catch (err) {
      setError(errMessage(err, t('admin.uploadFailed')));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(imageId: string) {
    if (!window.confirm(t('admin.confirmRemoveImage'))) return;
    try {
      await api.adminDeleteGameImage(gameId, imageId);
      onChanged();
    } catch (err) {
      setError(errMessage(err, t('common.error')));
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ImageIcon aria-hidden className="size-4 text-primary" /> {t('admin.images')}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as (typeof IMAGE_TYPES)[number])} className={inputClass}>
          {IMAGE_TYPES.map((it) => <option key={it} value={it}>{it}</option>)}
        </select>
        <label className={`${primaryBtnClass} cursor-pointer`}>
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {t('admin.upload')}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void handleFile(e)} disabled={uploading} className="hidden" />
        </label>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {images.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('admin.noImages')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img) => (
            <div key={String(img.id)} className="space-y-1.5">
              <div className="aspect-video overflow-hidden rounded-lg border border-border bg-secondary">
                <img src={String(img.url)} alt="" className="size-full object-cover" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{String(img.type)}</span>
                <button type="button" onClick={() => void handleDelete(String(img.id))} className="text-destructive hover:underline">
                  {t('admin.remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ReqForm {
  os: string;
  cpu: string;
  gpu: string;
  ramGb: string;
  storageGb: string;
  directx: string;
  notes: string;
}

function emptyReq(): ReqForm {
  return { os: '', cpu: '', gpu: '', ramGb: '', storageGb: '', directx: '', notes: '' };
}

function reqFromRow(row: Record<string, unknown> | undefined): ReqForm {
  if (!row) return emptyReq();
  return {
    os: String(row.os ?? ''),
    cpu: String(row.cpu ?? ''),
    gpu: String(row.gpu ?? ''),
    ramGb: String(row.ramGb ?? ''),
    storageGb: String(row.storageGb ?? ''),
    directx: String(row.directx ?? ''),
    notes: String(row.notes ?? ''),
  };
}

function RequirementsSection({ gameId, requirements }: { gameId: string; requirements: Record<string, unknown>[] }) {
  const { t } = useTranslation();
  const minimum = requirements.find((r) => r.tier === 'minimum');
  const recommended = requirements.find((r) => r.tier === 'recommended');
  const [min, setMin] = useState<ReqForm>(reqFromRow(minimum));
  const [rec, setRec] = useState<ReqForm>(reqFromRow(recommended));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const toInput = (r: ReqForm) => ({
        os: r.os,
        cpu: r.cpu,
        gpu: r.gpu,
        ramGb: Number(r.ramGb) || 0,
        storageGb: Number(r.storageGb) || 0,
        directx: r.directx || null,
        notes: r.notes || null,
      });
      await api.adminSetGameRequirements(gameId, { minimum: toInput(min), recommended: toInput(rec) });
      setMsg(t('admin.saved'));
    } catch (err) {
      setMsg(errMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  }

  function reqFields(r: ReqForm, set: (r: ReqForm) => void) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={r.os} onChange={(e) => set({ ...r, os: e.target.value })} placeholder={t('admin.osLabel')} className={inputClass} />
        <input value={r.cpu} onChange={(e) => set({ ...r, cpu: e.target.value })} placeholder="CPU" className={inputClass} />
        <input value={r.gpu} onChange={(e) => set({ ...r, gpu: e.target.value })} placeholder="GPU" className={inputClass} />
        <input type="number" value={r.ramGb} onChange={(e) => set({ ...r, ramGb: e.target.value })} placeholder="RAM (GB)" className={inputClass} />
        <input type="number" value={r.storageGb} onChange={(e) => set({ ...r, storageGb: e.target.value })} placeholder="Storage (GB)" className={inputClass} />
        <input value={r.directx} onChange={(e) => set({ ...r, directx: e.target.value })} placeholder="DirectX" dir="ltr" className={inputClass} />
        <input value={r.notes} onChange={(e) => set({ ...r, notes: e.target.value })} placeholder={t('admin.notesLabel')} className={`${inputClass} sm:col-span-2`} />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">{t('admin.requirements')}</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('admin.minimum')}</p>
          {reqFields(min, setMin)}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('admin.recommended')}</p>
          {reqFields(rec, setRec)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void handleSave()} disabled={saving} className={primaryBtnClass}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t('admin.saveRequirements')}
        </button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
