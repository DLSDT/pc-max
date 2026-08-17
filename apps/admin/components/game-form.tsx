'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import type { Category, GameCreateInput, GameDetail, Tag } from '@goh/types';

const TECH_FLAGS = [
  { key: 'dlss', label: 'DLSS (NVIDIA)' },
  { key: 'fsr', label: 'FSR (AMD)' },
  { key: 'xess', label: 'XeSS (Intel)' },
  { key: 'ray_tracing', label: 'Ray Tracing' },
  { key: 'frame_generation', label: 'Frame Generation' },
  { key: 'nvidia', label: 'NVIDIA' },
  { key: 'amd', label: 'AMD' },
  { key: 'intel', label: 'Intel' },
] as const;

interface GameFormProps {
  initial?: GameDetail;
  onSaved: (game: GameDetail) => void;
}

export function GameForm({ initial, onSaved }: GameFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Partial<GameCreateInput>>(() => {
    if (!initial)
      return {
        technologies: {} as GameCreateInput['technologies'],
        featured: false,
        status: 'draft' as const,
        performanceRating: 60,
        executables: [] as string[],
        steamAppId: '',
        epicAppId: '',
        launcher: '' as GameCreateInput['launcher'],
        genreSlugs: [] as string[],
        tagSlugs: [] as string[],
      };
    return {
      name: initial.name,
      slug: initial.slug,
      tagline: initial.tagline ?? '',
      description: initial.description ?? '',
      developer: initial.developer ?? '',
      publisher: initial.publisher ?? '',
      releaseDate: initial.releaseDate?.slice(0, 10) ?? '',
      engine: initial.engine ?? '',
      api: initial.api ?? '',
      executables: initial.executables ?? [],
      steamAppId: initial.steamAppId ?? '',
      epicAppId: initial.epicAppId ?? '',
      launcher: (initial.launcher ?? '') as GameCreateInput['launcher'],
      technologies: initial.technologies,
      performanceRating: initial.performanceRating,
      featured: initial.featured,
      status: initial.status,
      genreSlugs: initial.genres.map((g) => g.slug),
      tagSlugs: initial.tags.map((t) => t.slug),
    };
  });

  useEffect(() => {
    void apiFetch<{ data: Category[] }>('/categories').then((r) => setCategories(r.data)).catch(() => {});
    void apiFetch<{ data: Tag[] }>('/admin/tags').then((r) => setTags(r.data)).catch(() => {});
  }, []);

  function set<K extends keyof GameCreateInput>(key: K, value: GameCreateInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleTech(key: string, checked: boolean) {
    set('technologies', { ...(form.technologies ?? {}), [key]: checked });
  }

  function toggleList(key: 'genreSlugs' | 'tagSlugs', slug: string) {
    const list = form[key] ?? [];
    set(key, list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        releaseDate: form.releaseDate || null,
        tagline: form.tagline || null,
        description: form.description || null,
        developer: form.developer || null,
        publisher: form.publisher || null,
        engine: form.engine || null,
        api: form.api || null,
        executables: (form.executables ?? []).filter(Boolean),
        steamAppId: form.steamAppId || null,
        epicAppId: form.epicAppId || null,
        launcher: form.launcher || null,
      };
      if (initial) {
        const updated = await apiFetch<GameDetail>(`/admin/games/${initial.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast.success('Game updated');
        onSaved(updated);
      } else {
        const created = await apiFetch<GameDetail>('/admin/games', { method: 'POST', body: JSON.stringify(payload) });
        toast.success('Game created — it is now visible in the desktop app');
        onSaved(created);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" required value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug *</Label>
                <Input id="slug" required value={form.slug ?? ''} onChange={(e) => set('slug', e.target.value)} placeholder="gta-v" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tagline">Tagline</Label>
              <Input id="tagline" value={form.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={5} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="developer">Developer</Label>
                <Input id="developer" value={form.developer ?? ''} onChange={(e) => set('developer', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="publisher">Publisher</Label>
                <Input id="publisher" value={form.publisher ?? ''} onChange={(e) => set('publisher', e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="releaseDate">Release date</Label>
                <Input id="releaseDate" type="date" value={form.releaseDate ?? ''} onChange={(e) => set('releaseDate', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="engine">Engine</Label>
                <Input id="engine" value={form.engine ?? ''} onChange={(e) => set('engine', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="api">API</Label>
                <Input id="api" value={form.api ?? ''} onChange={(e) => set('api', e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Classification</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Genres</Label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {categories.map((c) => (
                    <label key={c.slug} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={(form.genreSlugs ?? []).includes(c.slug)} onCheckedChange={(v) => toggleList('genreSlugs', c.slug)} />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <button
                      type="button"
                      key={t.slug}
                      onClick={() => toggleList('tagSlugs', t.slug)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        (form.tagSlugs ?? []).includes(t.slug) ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:border-border'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rating">Performance rating (0–100)</Label>
                  <Input id="rating" type="number" min={0} max={100} value={form.performanceRating ?? 60} onChange={(e) => set('performanceRating', Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select value={form.status} onValueChange={(v) => set('status', v as GameCreateInput['status'])}>
                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={Boolean(form.featured)} onCheckedChange={(v) => set('featured', Boolean(v))} />
                Featured on Home
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Game Detection</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="executables">Executable names</Label>
                <Input
                  id="executables"
                  value={(form.executables ?? []).join(', ')}
                  onChange={(e) => set('executables', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  placeholder="GTA5.exe, PlayGTAV.exe"
                />
                <p className="text-xs text-muted-foreground">Comma-separated .exe names used by the desktop app to detect the game on disk.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="steamAppId">Steam App ID</Label>
                  <Input id="steamAppId" value={form.steamAppId ?? ''} onChange={(e) => set('steamAppId', e.target.value)} placeholder="271590" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="epicAppId">Epic App ID</Label>
                  <Input id="epicAppId" value={form.epicAppId ?? ''} onChange={(e) => set('epicAppId', e.target.value)} placeholder="luna" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="launcher">Launcher</Label>
                  <Select value={form.launcher ?? ''} onValueChange={(v) => set('launcher', v as GameCreateInput['launcher'])}>
                    <SelectTrigger id="launcher"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">—</SelectItem>
                      <SelectItem value="steam">Steam</SelectItem>
                      <SelectItem value="epic">Epic Games</SelectItem>
                      <SelectItem value="gog">GOG</SelectItem>
                      <SelectItem value="standalone">Standalone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Supported Technologies</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-1.5">
              {TECH_FLAGS.map((t) => (
                <label key={t.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={Boolean((form.technologies ?? {})[t.key as keyof typeof form.technologies])}
                    onCheckedChange={(v) => toggleTech(t.key, Boolean(v))}
                  />
                  {t.label}
                </label>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => window.history.back()}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Create game'}</Button>
      </div>
    </form>
  );
}
