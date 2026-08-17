'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Rocket, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiFetch, fmtDate } from '@/lib/api';
import type { OptimizationCategory, OptimizationProfile, OptimizationSetting, ProfileVersion } from '@goh/types';

export default function ProfileEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [profile, setProfile] = useState<OptimizationProfile | null>(null);
  const [optCategories, setOptCategories] = useState<OptimizationCategory[]>([]);
  const [versions, setVersions] = useState<ProfileVersion[]>([]);
  const [savingMeta, setSavingMeta] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [toDelete, setToDelete] = useState<{ kind: 'setting' | 'option'; id: string } | null>(null);
  const [newSetting, setNewSetting] = useState({ key: '', name: '', type: 'select' as const, value: '', categorySlug: '', sortOrder: 0 });

  const load = useCallback(async () => {
    try {
      const [p, c, v] = await Promise.all([
        apiFetch<OptimizationProfile>(`/admin/profiles/${id}`),
        apiFetch<{ data: OptimizationCategory[] }>('/admin/optimization-categories'),
        apiFetch<{ data: ProfileVersion[] }>(`/admin/profiles/${id}/versions`),
      ]);
      setProfile(p);
      setOptCategories(c.data);
      setVersions(v.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load profile');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMeta() {
    if (!profile) return;
    setSavingMeta(true);
    try {
      const updated = await apiFetch<OptimizationProfile>(`/admin/profiles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: profile.name,
          slug: profile.slug,
          description: profile.description,
          targetFps: profile.targetFps,
          hardwareTier: profile.hardwareTier,
          isDefault: profile.isDefault,
        }),
      });
      setProfile(updated);
      toast.success('Profile saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingMeta(false);
    }
  }

  async function publish(status: 'published' | 'draft') {
    try {
      await apiFetch(`/admin/profiles/${id}/publish`, { method: 'POST', body: JSON.stringify({ status }) });
      toast.success(status === 'published' ? 'Profile published' : 'Profile set to draft');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status');
    }
  }

  async function createVersion() {
    try {
      const res = await apiFetch<{ version: string }>(`/admin/profiles/${id}/versions`, {
        method: 'POST',
        body: JSON.stringify({ changeNote }),
      });
      toast.success(`New version ${res.version} released`);
      setChangeNote('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create version');
    }
  }

  async function addSetting() {
    try {
      await apiFetch(`/admin/profiles/${id}/settings`, {
        method: 'POST',
        body: JSON.stringify({ ...newSetting, categorySlug: newSetting.categorySlug || null }),
      });
      toast.success('Setting added');
      setNewSetting({ key: '', name: '', type: 'select', value: '', categorySlug: '', sortOrder: 0 });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add setting');
    }
  }

  async function deleteSetting(settingId: string) {
    try {
      await apiFetch(`/admin/settings/${settingId}`, { method: 'DELETE' });
      toast.success('Setting removed');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove setting');
    }
  }

  async function addOption(setting: OptimizationSetting, value: string) {
    if (!value) return;
    try {
      await apiFetch(`/admin/settings/${setting.id}/options`, {
        method: 'POST',
        body: JSON.stringify({ value, label: value, isRecommended: false, sortOrder: setting.options.length }),
      });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add option');
    }
  }

  async function deleteOption(optionId: string) {
    try {
      await apiFetch(`/admin/options/${optionId}`, { method: 'DELETE' });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove option');
    }
  }

  async function updateSettingValue(settingId: string, value: string) {
    try {
      await apiFetch(`/admin/settings/${settingId}`, { method: 'PATCH', body: JSON.stringify({ value }) });
    } catch {
      // value updates are non-critical; surface quietly
    }
  }

  if (!profile) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }

  const grouped = new Map<string | null, OptimizationSetting[]>();
  for (const s of profile.settings) {
    const key = s.category?.slug ?? '__ungrouped__';
    grouped.set(key, [...(grouped.get(key) ?? []), s]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{profile.name}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.slug} · v{profile.version} · {profile.targetFps ?? '—'} FPS · {profile.hardwareTier} ·{' '}
            {fmtDate(profile.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {profile.status === 'published' ? (
            <Button variant="outline" size="sm" onClick={() => publish('draft')}>Unpublish</Button>
          ) : (
            <Button size="sm" onClick={() => publish('published')}><Rocket className="h-4 w-4" /> Publish</Button>
          )}
          <Badge variant={profile.status === 'published' ? 'success' : 'secondary'}>{profile.status}</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Settings</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {[...grouped.entries()].map(([categorySlug, settings]) => {
              const cat = optCategories.find((c) => c.slug === categorySlug);
              return (
                <div key={categorySlug ?? 'ungrouped'}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Layers className="h-4 w-4" />
                    {cat?.name ?? 'Ungrouped'}
                  </div>
                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                      <tbody>
                        {settings.map((s) => (
                          <tr key={s.id} className="border-b last:border-0">
                            <td className="w-48 px-3 py-2 align-top">
                              <div className="font-medium">{s.name}</div>
                              <div className="text-xs text-muted-foreground">{s.key}</div>
                            </td>
                            <td className="px-3 py-2">
                              {s.type === 'select' ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Select value={s.value} onValueChange={(v) => void updateSettingValue(s.id, v)}>
                                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {s.options.map((o) => (
                                        <SelectItem key={o.id} value={o.value}>
                                          {o.label}{o.isRecommended ? ' ★' : ''}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <OptionAdder setting={s} onAdd={(v) => void addOption(s, v)} onRemove={(oid) => setToDelete({ kind: 'option', id: oid })} />
                                </div>
                              ) : (
                                <Input
                                  defaultValue={s.value}
                                  className="h-8 w-44"
                                  onBlur={(e) => void updateSettingValue(s.id, e.target.value)}
                                />
                              )}
                            </td>
                            <td className="w-10 px-2 text-right">
                              <Button variant="ghost" size="icon" onClick={() => setToDelete({ kind: 'setting', id: s.id })}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {profile.settings.length === 0 && <p className="text-sm text-muted-foreground">No settings yet — add the first one below.</p>}

            <Separator />

            <div className="rounded-lg border border-dashed p-4">
              <div className="mb-3 text-sm font-medium">Add setting</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Input placeholder="Key (e.g. texture-quality)" value={newSetting.key} onChange={(e) => setNewSetting((f) => ({ ...f, key: e.target.value }))} />
                <Input placeholder="Name (e.g. Texture Quality)" value={newSetting.name} onChange={(e) => setNewSetting((f) => ({ ...f, name: e.target.value }))} />
                <Select value={newSetting.type} onValueChange={(v) => setNewSetting((f) => ({ ...f, type: v as typeof newSetting.type }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="select">Select</SelectItem>
                    <SelectItem value="boolean">Boolean</SelectItem>
                    <SelectItem value="slider">Slider</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={newSetting.categorySlug} onValueChange={(v) => setNewSetting((f) => ({ ...f, categorySlug: v }))}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {optCategories.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="Value (e.g. High)" value={newSetting.value} onChange={(e) => setNewSetting((f) => ({ ...f, value: e.target.value }))} />
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={addSetting} disabled={!newSetting.key || !newSetting.name}>
                  <Plus className="h-4 w-4" /> Add setting
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Profile meta</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input value={profile.slug} onChange={(e) => setProfile({ ...profile, slug: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea rows={3} value={profile.description ?? ''} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Target FPS</Label>
                  <Input type="number" value={profile.targetFps ?? ''} onChange={(e) => setProfile({ ...profile, targetFps: Number(e.target.value) || null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Hardware tier</Label>
                  <Select value={profile.hardwareTier} onValueChange={(v) => setProfile({ ...profile, hardwareTier: v as OptimizationProfile['hardwareTier'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low_end">Low-end</SelectItem>
                      <SelectItem value="mid_range">Mid-range</SelectItem>
                      <SelectItem value="high_end">High-end</SelectItem>
                      <SelectItem value="ultra">Ultra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={profile.isDefault} onCheckedChange={(v) => setProfile({ ...profile, isDefault: Boolean(v) })} />
                Default profile
              </label>
              <Button className="w-full" onClick={saveMeta} disabled={savingMeta}>{savingMeta ? 'Saving…' : 'Save meta'}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Versioning</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current version</span>
                <Badge>v{profile.version}</Badge>
              </div>
              <div className="space-y-1.5">
                <Label>Change note</Label>
                <Textarea rows={2} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="What changed in this release?" />
              </div>
              <Button className="w-full" onClick={createVersion}><Rocket className="h-4 w-4" /> Release new version</Button>
              <div className="max-h-44 space-y-1.5 overflow-y-auto pt-1">
                {versions.map((v) => (
                  <div key={v.id} className="rounded-md border px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">v{v.version}</span>
                      <span className="text-muted-foreground">{fmtDate(v.createdAt)}</span>
                    </div>
                    {v.changeNote && <div className="mt-0.5 text-muted-foreground">{v.changeNote}</div>}
                  </div>
                ))}
                {versions.length === 0 && <p className="text-xs text-muted-foreground">No version history yet.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={toDelete?.kind === 'setting' ? 'Delete setting?' : 'Delete option?'}
        description="This cannot be undone. Consider releasing a new version after significant changes."
        onOpenChange={(o) => !o && setToDelete(null)}
        onConfirm={() => {
          if (toDelete?.kind === 'setting') void deleteSetting(toDelete.id);
          if (toDelete?.kind === 'option') void deleteOption(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}

function OptionAdder({
  setting,
  onAdd,
  onRemove,
}: {
  setting: OptimizationSetting;
  onAdd: (value: string) => void;
  onRemove: (optionId: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="flex items-center gap-1.5">
      <Input placeholder="+ option" className="h-8 w-28" value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(value); setValue(''); } }} />
      <div className="flex flex-wrap gap-1">
        {setting.options.map((o) => (
          <span key={o.id} className="group inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
            {o.label}
            {o.isRecommended && '★'}
            <button className="hidden text-muted-foreground hover:text-destructive group-hover:inline" onClick={() => onRemove(o.id)} aria-label={`Remove ${o.label}`}>
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
