import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2, ArrowLeft, Rocket, GitBranch, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { errMessage, iconBtnClass, inputClass, LoadingState, ErrorState, EmptyState, primaryBtnClass, dangerIconBtnClass, TableWrap } from './shared';

const HARDWARE_TIERS = ['low_end', 'mid_range', 'high_end', 'ultra'] as const;
const SETTING_TYPES = ['select', 'boolean', 'slider', 'text'] as const;
const COLOR_PROFILES = ['', 'yellow', 'green'] as const;

export default function ProfilesTab() {
  const { t } = useTranslation();
  const [games, setGames] = useState<Record<string, unknown>[]>([]);
  const [gameId, setGameId] = useState('');
  const [loadingGames, setLoadingGames] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminGames({ limit: '100' })
      .then((res) => {
        setGames(res.data ?? []);
        setLoadingGames(false);
      })
      .catch(() => setLoadingGames(false));
  }, []);

  if (loadingGames) return <LoadingState />;

  if (profileId) return <ProfileEditor profileId={profileId} onBack={() => setProfileId(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">{t('admin.game')}</label>
        <select value={gameId} onChange={(e) => setGameId(e.target.value)} className={`${inputClass} max-w-sm`}>
          <option value="">{t('admin.selectGame')}</option>
          {games.map((g) => (
            <option key={String(g.id)} value={String(g.id)}>
              {String(g.name)}
            </option>
          ))}
        </select>
      </div>
      {gameId && <ProfilesList gameId={gameId} onSelect={setProfileId} />}
    </div>
  );
}

function ProfilesList({ gameId, onSelect }: { gameId: string; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [hardwareTier, setHardwareTier] = useState<(typeof HARDWARE_TIERS)[number]>('mid_range');
  const [targetFps, setTargetFps] = useState('60');
  const [colorProfile, setColorProfile] = useState<(typeof COLOR_PROFILES)[number]>('');
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    api
      .adminGameProfiles(gameId)
      .then((res) => {
        setProfiles(res.data ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(errMessage(err, t('common.error')));
        setLoading(false);
      });
  }

  useEffect(load, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!slug.trim() || !name.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      await api.adminCreateProfile(gameId, {
        slug: slug.trim(),
        name: name.trim(),
        hardwareTier,
        targetFps: targetFps ? Number(targetFps) : null,
        colorProfile: colorProfile || null,
      });
      setSlug('');
      setName('');
      load();
    } catch (err) {
      setActionError(errMessage(err, t('common.error')));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(profile: Record<string, unknown>) {
    if (!window.confirm(t('admin.confirmDeleteProfile', { name: String(profile.name) }))) return;
    setBusyId(String(profile.id));
    setActionError(null);
    try {
      await api.adminDeleteProfile(String(profile.id));
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
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="balanced" dir="ltr" className={inputClass} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Balanced" className={inputClass} />
        <select value={hardwareTier} onChange={(e) => setHardwareTier(e.target.value as (typeof HARDWARE_TIERS)[number])} className={inputClass}>
          {HARDWARE_TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
        </select>
        <input value={targetFps} onChange={(e) => setTargetFps(e.target.value)} type="number" placeholder={t('admin.targetFps')} className={`${inputClass} w-28`} />
        <select value={colorProfile} onChange={(e) => setColorProfile(e.target.value as (typeof COLOR_PROFILES)[number])} className={inputClass}>
          <option value="">{t('admin.noColorTag')}</option>
          <option value="yellow">{t('admin.yellowTag')}</option>
          <option value="green">{t('admin.greenTag')}</option>
        </select>
        <button type="button" onClick={() => void handleCreate()} disabled={creating || !slug.trim() || !name.trim()} className={primaryBtnClass}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('admin.createProfile')}
        </button>
      </div>
      {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      {profiles.length === 0 ? (
        <EmptyState message={t('admin.noProfiles')} />
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">{t('admin.name')}</th>
                <th className="px-4 py-3">{t('admin.tier')}</th>
                <th className="px-4 py-3">{t('admin.version')}</th>
                <th className="px-4 py-3">{t('admin.status')}</th>
                <th className="px-4 py-3 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const id = String(p.id);
                return (
                  <tr key={id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => onSelect(id)} className="font-medium text-primary hover:underline">
                        {String(p.name)}
                      </button>
                      {p.colorProfile ? (
                        <span className={`ms-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.colorProfile === 'yellow' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                          {String(p.colorProfile)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{String(p.hardwareTier)}</td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">{String(p.version)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.status === 'published' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {String(p.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => onSelect(id)} title={t('admin.manage')} aria-label={t('admin.manage')} className={iconBtnClass}>
                          <ChevronRight className="size-3.5" />
                        </button>
                        <button type="button" onClick={() => void handleDelete(p)} disabled={busyId === id} title={t('admin.delete')} aria-label={t('admin.delete')} className={dangerIconBtnClass}>
                          {busyId === id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
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

function ProfileEditor({ profileId, onBack }: { profileId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [settingKey, setSettingKey] = useState('');
  const [settingName, setSettingName] = useState('');
  const [settingType, setSettingType] = useState<(typeof SETTING_TYPES)[number]>('select');
  const [settingValue, setSettingValue] = useState('');
  const [settingCategory, setSettingCategory] = useState('');
  const [addingSetting, setAddingSetting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function load() {
    setLoading(true);
    api
      .adminGetProfile(profileId)
      .then((res) => {
        setProfile(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(errMessage(err, t('common.error')));
        setLoading(false);
      });
  }

  useEffect(load, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTogglePublish() {
    const next = profile?.status === 'published' ? 'draft' : 'published';
    setBusy(true);
    setActionMsg(null);
    try {
      await api.adminPublishProfile(profileId, next);
      setActionMsg(next === 'published' ? t('admin.published') : t('admin.unpublished'));
      load();
    } catch (err) {
      setActionMsg(errMessage(err, t('common.error')));
    } finally {
      setBusy(false);
    }
  }

  async function handleReleaseVersion() {
    const note = window.prompt(t('admin.changeNotePrompt')) ?? undefined;
    setBusy(true);
    setActionMsg(null);
    try {
      await api.adminReleaseProfileVersion(profileId, note);
      setActionMsg(t('admin.versionReleased'));
      load();
    } catch (err) {
      setActionMsg(errMessage(err, t('common.error')));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSetting() {
    if (!settingKey.trim() || !settingName.trim()) return;
    setAddingSetting(true);
    setActionMsg(null);
    try {
      await api.adminAddSetting(profileId, {
        key: settingKey.trim(),
        name: settingName.trim(),
        type: settingType,
        value: settingValue.trim(),
        categorySlug: settingCategory.trim() || undefined,
      });
      setSettingKey('');
      setSettingName('');
      setSettingValue('');
      setSettingCategory('');
      load();
    } catch (err) {
      setActionMsg(errMessage(err, t('common.error')));
    } finally {
      setAddingSetting(false);
    }
  }

  async function handleDeleteSetting(settingId: string) {
    if (!window.confirm(t('admin.confirmDeleteSetting'))) return;
    try {
      await api.adminDeleteSetting(settingId);
      load();
    } catch (err) {
      setActionMsg(errMessage(err, t('common.error')));
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!profile) return null;

  const settings = (profile.settings as Record<string, unknown>[]) ?? [];

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> {t('admin.backToProfiles')}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
        <div>
          <h3 className="text-sm font-semibold">{String(profile.name)}</h3>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {String(profile.slug)} · v{String(profile.version)} ·{' '}
            <span className={profile.status === 'published' ? 'text-emerald-500' : 'text-amber-500'}>{String(profile.status)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void handleTogglePublish()} disabled={busy} className={primaryBtnClass}>
            <Rocket aria-hidden className="size-3.5" /> {profile.status === 'published' ? t('admin.unpublish') : t('admin.publish')}
          </button>
          <button type="button" onClick={() => void handleReleaseVersion()} disabled={busy} className={primaryBtnClass}>
            <GitBranch aria-hidden className="size-3.5" /> {t('admin.releaseNewVersion')}
          </button>
        </div>
      </div>
      {actionMsg && <p className="text-xs text-muted-foreground">{actionMsg}</p>}

      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">{t('admin.settings')}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <input value={settingKey} onChange={(e) => setSettingKey(e.target.value)} placeholder="key (texture-quality)" dir="ltr" className={inputClass} />
          <input value={settingName} onChange={(e) => setSettingName(e.target.value)} placeholder={t('admin.name')} className={inputClass} />
          <select value={settingType} onChange={(e) => setSettingType(e.target.value as (typeof SETTING_TYPES)[number])} className={inputClass}>
            {SETTING_TYPES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <input value={settingValue} onChange={(e) => setSettingValue(e.target.value)} placeholder={t('admin.value')} className={inputClass} />
          <input value={settingCategory} onChange={(e) => setSettingCategory(e.target.value)} placeholder={t('admin.categorySlug')} dir="ltr" className={inputClass} />
          <button type="button" onClick={() => void handleAddSetting()} disabled={addingSetting || !settingKey.trim() || !settingName.trim()} className={primaryBtnClass}>
            {addingSetting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {t('admin.addSetting')}
          </button>
        </div>

        {settings.length === 0 ? (
          <EmptyState message={t('admin.noSettings')} />
        ) : (
          <div className="space-y-2">
            {settings.map((s) => {
              const id = String(s.id);
              const isOpen = expanded.has(id);
              return (
                <div key={id} className="rounded-lg border border-border bg-background/40">
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <button type="button" onClick={() => toggleExpanded(id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
                      {isOpen ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                      <span className="truncate font-medium">{String(s.name)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">{String(s.type)} · {String(s.value)}</span>
                    </button>
                    <button type="button" onClick={() => void handleDeleteSetting(id)} className={dangerIconBtnClass}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  {isOpen && <OptionsEditor settingId={id} options={(s.options as Record<string, unknown>[]) ?? []} onChanged={load} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function OptionsEditor({ settingId, options, onChanged }: { settingId: string; options: Record<string, unknown>[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [isRecommended, setIsRecommended] = useState(false);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleAdd() {
    if (!value.trim() || !label.trim()) return;
    setAdding(true);
    setMsg(null);
    try {
      await api.adminAddOption(settingId, { value: value.trim(), label: label.trim(), isRecommended });
      setValue('');
      setLabel('');
      setIsRecommended(false);
      onChanged();
    } catch (err) {
      setMsg(errMessage(err, t('common.error')));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(optionId: string) {
    try {
      await api.adminDeleteOption(optionId);
      onChanged();
    } catch (err) {
      setMsg(errMessage(err, t('common.error')));
    }
  }

  return (
    <div className="space-y-2 border-t border-border px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" dir="ltr" className={`${inputClass} h-7 text-xs`} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('admin.name')} className={`${inputClass} h-7 text-xs`} />
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={isRecommended} onChange={(e) => setIsRecommended(e.target.checked)} /> {t('admin.recommendedShort')}
        </label>
        <button type="button" onClick={() => void handleAdd()} disabled={adding || !value.trim() || !label.trim()} className={`${primaryBtnClass} h-7`}>
          {adding ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
        </button>
      </div>
      {msg && <p className="text-xs text-destructive">{msg}</p>}
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('admin.noOptions')}</p>
      ) : (
        <ul className="space-y-1">
          {options.map((o) => (
            <li key={String(o.id)} className="flex items-center justify-between text-xs">
              <span>
                {String(o.label)} <span className="text-muted-foreground" dir="ltr">({String(o.value)})</span>
                {o.isRecommended ? <span className="ml-1 text-emerald-500">★</span> : null}
              </span>
              <button type="button" onClick={() => void handleDelete(String(o.id))} className="text-destructive hover:underline">
                {t('admin.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
