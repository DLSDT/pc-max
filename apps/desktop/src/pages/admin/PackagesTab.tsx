import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Plus, Rocket, Settings2, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { errMessage, iconBtnClass, inputClass, LoadingState, ErrorState, EmptyState, primaryBtnClass, dangerIconBtnClass, TableWrap } from './shared';

const KINDS = ['graphics', 'frame_generation', 'upscaler', 'optiflow', 'optiscaler'] as const;
const GPU_VENDORS = ['any', 'nvidia', 'amd', 'intel'] as const;
const ARCHES = ['any', 'x64', 'arm64'] as const;
const OPERATIONS = ['replace', 'add'] as const;
const ROLES = ['relative', 'streamline', 'launcher'] as const;

/** Kinds whose packages are global — the same bytes for every game, so the
 *  game select is not just optional but wrong to fill in. */
const GLOBAL_KINDS = new Set<string>(['optiflow', 'optiscaler']);

/** i18n key + badge colour per package kind (single source for both selects). */
const KIND_META: Record<(typeof KINDS)[number], { i18nKey: string; badge: string }> = {
  graphics: { i18nKey: 'admin.kindGraphics', badge: 'bg-secondary text-secondary-foreground' },
  frame_generation: { i18nKey: 'admin.kindFrameGeneration', badge: 'bg-primary/10 text-primary' },
  upscaler: { i18nKey: 'admin.kindUpscaler', badge: 'bg-emerald-500/10 text-emerald-400' },
  optiflow: { i18nKey: 'admin.kindOptiFlow', badge: 'bg-sky-500/10 text-sky-400' },
  optiscaler: { i18nKey: 'admin.kindOptiScaler', badge: 'bg-violet-500/10 text-violet-400' },
};

function kindMeta(kind: string) {
  return KIND_META[kind as (typeof KINDS)[number]] ?? KIND_META.graphics;
}

/** Options for a package-kind <select> — keeps both selects in sync. */
function KindOptions() {
  const { t } = useTranslation();
  return (
    <>
      {KINDS.map((k) => (
        <option key={k} value={k}>
          {t(KIND_META[k].i18nKey)}
        </option>
      ))}
    </>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const { t } = useTranslation();
  const meta = kindMeta(kind);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
      {t(meta.i18nKey)}
    </span>
  );
}

export default function PackagesTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (selectedId) return <PackageEditor id={selectedId} onBack={() => setSelectedId(null)} />;
  return <PackagesList onManage={setSelectedId} />;
}

function PackagesList({ onManage }: { onManage: (id: string) => void }) {
  const { t } = useTranslation();
  const [pkgs, setPkgs] = useState<Record<string, unknown>[]>([]);
  const [games, setGames] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [gameId, setGameId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]>('graphics');
  const isGlobalKind = GLOBAL_KINDS.has(kind);
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([api.adminPackages(), api.adminGames({ limit: '100' })])
      .then(([pkgRes, gameRes]) => {
        setPkgs(pkgRes.data ?? []);
        setTotal(pkgRes.total ?? 0);
        setGames(gameRes.data ?? []);
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

  async function handleCreate() {
    if (!name.trim() || !slug.trim()) return;
    if (!isGlobalKind && !gameId) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await api.adminCreatePackage({
        gameId: isGlobalKind ? null : gameId,
        name: name.trim(),
        slug: slug.trim(),
        kind,
      });
      setName('');
      setSlug('');
      setKind('graphics');
      load();
      onManage(String(created.id));
    } catch (err) {
      setActionError(errMessage(err, t('common.error')));
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('admin.packagesNote')}</p>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('admin.game')}</label>
          <select
            value={isGlobalKind ? '' : gameId}
            disabled={isGlobalKind}
            onChange={(e) => setGameId(e.target.value)}
            className={`${inputClass} max-w-56 disabled:opacity-50`}
          >
            <option value="">{isGlobalKind ? t('admin.globalPackage') : t('admin.selectGame')}</option>
            {games.map((g) => (
              <option key={String(g.id)} value={String(g.id)}>
                {String(g.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('admin.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="DLSS Frame Generation" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('admin.slug')}</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} dir="ltr" className={inputClass} placeholder="dlss-frame-gen" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('admin.kind')}</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])} className={inputClass}>
            <KindOptions />
          </select>
        </div>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating || (!isGlobalKind && !gameId) || !name.trim() || !slug.trim()}
          className={primaryBtnClass}
        >
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('admin.createPackage')}
        </button>
      </div>

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
                <th className="px-4 py-3">{t('admin.kind')}</th>
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
                    <td className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => onManage(id)} className="text-primary hover:underline">
                        {String(p.name ?? '—')}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {/* A global package has no game; "—" would read as missing data. */}
                      {p.gameId == null ? (
                        <span className="italic">{t('admin.globalShort')}</span>
                      ) : (
                        String(p.gameName ?? p.gameSlug ?? '—')
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <KindBadge kind={String(p.kind ?? 'graphics')} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status === 'published' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => onManage(id)} title={t('admin.manage')} aria-label={t('admin.manage')} className={iconBtnClass}>
                          <Settings2 className="size-3.5" />
                        </button>
                        {status === 'published' && (
                          <button
                            type="button"
                            onClick={() => void run(id, () => api.adminArchivePackage(id))}
                            disabled={busyId === id}
                            title={t('admin.archive')}
                            aria-label={t('admin.archive')}
                            className={iconBtnClass}
                          >
                            {busyId === id ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
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

function PackageEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation();
  const [pkg, setPkg] = useState<Record<string, unknown> | null>(null);
  const [files, setFiles] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [destination, setDestination] = useState('');
  const [operation, setOperation] = useState<(typeof OPERATIONS)[number]>('replace');
  const [role, setRole] = useState<(typeof ROLES)[number]>('relative');
  const [variant, setVariant] = useState('');

  const [form, setForm] = useState<Record<string, unknown>>({});

  function load() {
    setLoading(true);
    Promise.all([api.adminGetPackage(id), api.adminPackageFiles(id)])
      .then(([pkgRes, filesRes]) => {
        setPkg(pkgRes);
        setFiles(filesRes.data ?? []);
        setForm({
          name: pkgRes.name ?? '',
          description: pkgRes.description ?? '',
          kind: pkgRes.kind ?? 'graphics',
          gpuVendor: pkgRes.gpuVendor ?? 'any',
          gpuFamily: pkgRes.gpuFamily ?? '',
          minVramMb: pkgRes.minVramMb ?? '',
          minRamGb: pkgRes.minRamGb ?? '',
          minWindows: pkgRes.minWindows ?? '',
          gameVersion: pkgRes.gameVersion ?? '',
          arch: pkgRes.arch ?? 'any',
          targetResolution: pkgRes.targetResolution ?? '',
          targetFps: pkgRes.targetFps ?? '',
          isDefault: Boolean(pkgRes.isDefault),
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
    setMsg(null);
    try {
      const patch: Record<string, unknown> = { ...form };
      for (const k of ['description', 'gpuFamily', 'minWindows', 'gameVersion', 'targetResolution']) {
        if (patch[k] === '') patch[k] = null;
      }
      patch.minVramMb = patch.minVramMb === '' ? null : Number(patch.minVramMb);
      patch.minRamGb = patch.minRamGb === '' ? null : Number(patch.minRamGb);
      patch.targetFps = patch.targetFps === '' ? null : Number(patch.targetFps);
      await api.adminUpdatePackage(id, patch);
      setMsg(t('admin.saved'));
      load();
    } catch (err) {
      setMsg(errMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setSaving(true);
    setMsg(null);
    try {
      await api.adminPublishPackage(id);
      setMsg(t('admin.published'));
      load();
    } catch (err) {
      setMsg(errMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !destination.trim()) return;
    // The server refuses a path for these roles; catching it here names the
    // problem next to the field instead of as a generic 400.
    if (role !== 'relative' && /[\\/]/.test(destination)) {
      setMsg(t('admin.roleNeedsBareName'));
      return;
    }
    setUploading(true);
    setMsg(null);
    try {
      const { uploadUrl, objectKey } = await api.adminPresignPackageUpload(id, file.name, file.size);
      await api.adminUploadPackageFile(uploadUrl, file);
      await api.adminCompletePackageFile(id, {
        storageKey: objectKey,
        filename: file.name,
        size: file.size,
        destination: destination.trim(),
        operation,
        role,
        variant: variant.trim() || undefined,
      });
      setDestination('');
      load();
    } catch (err) {
      setMsg(errMessage(err, t('admin.uploadFailed')));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!window.confirm(t('admin.confirmRemoveFile'))) return;
    try {
      await api.adminDeletePackageFile(id, fileId);
      load();
    } catch (err) {
      setMsg(errMessage(err, t('common.error')));
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!pkg) return null;

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> {t('admin.backToPackages')}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
        <div>
          <h3 className="text-sm font-semibold">{String(pkg.name)}</h3>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {String(pkg.slug)} · v{String(pkg.version)} ·{' '}
            <span className={pkg.status === 'published' ? 'text-emerald-500' : 'text-amber-500'}>{String(pkg.status)}</span>
          </p>
        </div>
        <button type="button" onClick={() => void handlePublish()} disabled={saving || files.length === 0} className={primaryBtnClass}>
          <Rocket aria-hidden className="size-3.5" />
          {t('admin.publishRelease')}
        </button>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}

      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">{t('admin.details')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('admin.name')}><input value={String(form.name ?? '')} onChange={(e) => setField('name', e.target.value)} className={inputClass} /></Field>
          <Field label={t('admin.kind')}>
            <select value={String(form.kind ?? 'graphics')} onChange={(e) => setField('kind', e.target.value)} className={inputClass}>
              <KindOptions />
            </select>
          </Field>
          <Field label={t('admin.gpuVendor')}>
            <select value={String(form.gpuVendor ?? 'any')} onChange={(e) => setField('gpuVendor', e.target.value)} className={inputClass}>
              {GPU_VENDORS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label={t('admin.gpuFamily')}><input value={String(form.gpuFamily ?? '')} onChange={(e) => setField('gpuFamily', e.target.value)} dir="ltr" className={inputClass} placeholder="RTX 40" /></Field>
          <Field label={t('admin.arch')}>
            <select value={String(form.arch ?? 'any')} onChange={(e) => setField('arch', e.target.value)} className={inputClass}>
              {ARCHES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label={t('admin.minVram')}><input type="number" value={String(form.minVramMb ?? '')} onChange={(e) => setField('minVramMb', e.target.value)} className={inputClass} /></Field>
          <Field label={t('admin.minRam')}><input type="number" value={String(form.minRamGb ?? '')} onChange={(e) => setField('minRamGb', e.target.value)} className={inputClass} /></Field>
          <Field label={t('admin.minWindowsLabel')}><input value={String(form.minWindows ?? '')} onChange={(e) => setField('minWindows', e.target.value)} dir="ltr" className={inputClass} placeholder="10" /></Field>
          <Field label={t('admin.gameVersionLabel')}><input value={String(form.gameVersion ?? '')} onChange={(e) => setField('gameVersion', e.target.value)} dir="ltr" className={inputClass} /></Field>
          <Field label={t('admin.targetResolution')}><input value={String(form.targetResolution ?? '')} onChange={(e) => setField('targetResolution', e.target.value)} dir="ltr" className={inputClass} placeholder="1440p" /></Field>
          <Field label={t('admin.targetFps')}><input type="number" value={String(form.targetFps ?? '')} onChange={(e) => setField('targetFps', e.target.value)} className={inputClass} /></Field>
          <Field label={t('admin.featured')}>
            <label className="flex h-8 items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(form.isDefault)} onChange={(e) => setField('isDefault', e.target.checked)} />
              {t('admin.defaultPackage')}
            </label>
          </Field>
        </div>
        <Field label={t('admin.description')}>
          <textarea value={String(form.description ?? '')} onChange={(e) => setField('description', e.target.value)} rows={3} className={`${inputClass} w-full`} />
        </Field>
        <button type="button" onClick={() => void handleSave()} disabled={saving} className={primaryBtnClass}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t('admin.saveChanges')}
        </button>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">{t('admin.packageFiles')}</h3>
        <p className="text-xs text-muted-foreground">{t(`admin.roleHint_${role}`)}</p>
        <p className="text-xs text-muted-foreground">{t('admin.variantHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder={role === 'relative' ? t('admin.destinationPlaceholder') : t('admin.destinationNamePlaceholder')}
            dir="ltr"
            className={inputClass}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])} className={inputClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`admin.role_${r}`)}
              </option>
            ))}
          </select>
          <select value={operation} onChange={(e) => setOperation(e.target.value as (typeof OPERATIONS)[number])} className={inputClass}>
            {OPERATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            placeholder={t('admin.variantPlaceholder')}
            dir="ltr"
            className={`${inputClass} max-w-44`}
            title={t('admin.variantHint')}
          />
          <label className={`${primaryBtnClass} cursor-pointer ${!destination.trim() || uploading ? 'pointer-events-none opacity-50' : ''}`}>
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {t('admin.upload')}
            <input type="file" onChange={(e) => void handleUpload(e)} disabled={!destination.trim() || uploading} className="hidden" />
          </label>
        </div>
        {files.length === 0 ? (
          <EmptyState message={t('admin.noFiles')} />
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">{t('admin.name')}</th>
                  <th className="px-4 py-2.5">{t('admin.destination')}</th>
                  <th className="px-4 py-2.5">{t('admin.fileRole')}</th>
                  <th className="px-4 py-2.5">{t('admin.variant')}</th>
                  <th className="px-4 py-2.5">{t('admin.operation')}</th>
                  <th className="px-4 py-2.5 text-right">{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={String(f.id)} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-medium" dir="ltr">{String(f.filename)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground" dir="ltr">{String(f.destination)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{t(`admin.role_${String(f.role ?? 'relative')}`)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground" dir="ltr">
                      {f.variant ? String(f.variant) : <span className="italic">{t('admin.variantBase')}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{String(f.operation)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => void handleDeleteFile(String(f.id))} className={dangerIconBtnClass}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
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
