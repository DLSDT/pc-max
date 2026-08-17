'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { apiFetch } from '@/lib/api';
import type { OptimizationProfile, ProfileCreateInput } from '@goh/types';

export default function NewProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<ProfileCreateInput>({
    slug: '',
    name: '',
    description: '',
    targetFps: 60,
    hardwareTier: 'mid_range',
    isDefault: false,
    version: '1.0.0',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await apiFetch<OptimizationProfile>(`/admin/games/${params.id}/profiles`, {
        method: 'POST',
        body: JSON.stringify({ ...form, description: form.description || null }),
      });
      toast.success('Profile created');
      router.push(`/profiles/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create profile');
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">New Optimization Profile</h1>
        <p className="text-sm text-muted-foreground">Profiles define recommended settings for a specific hardware tier.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Profile details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Balanced" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug *</Label>
                <Input id="slug" required value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="balanced" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={3} value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="fps">Target FPS</Label>
                <Input id="fps" type="number" min={15} max={500} value={form.targetFps ?? 60} onChange={(e) => setForm((f) => ({ ...f, targetFps: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Hardware tier</Label>
                <Select value={form.hardwareTier} onValueChange={(v) => setForm((f) => ({ ...f, hardwareTier: v as ProfileCreateInput['hardwareTier'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low_end">Low-end</SelectItem>
                    <SelectItem value="mid_range">Mid-range</SelectItem>
                    <SelectItem value="high_end">High-end</SelectItem>
                    <SelectItem value="ultra">Ultra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="version">Version</Label>
                <Input id="version" value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} placeholder="1.0.0" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={Boolean(form.isDefault)} onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: Boolean(v) }))} />
              Default profile (shown on the game card)
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create profile'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
