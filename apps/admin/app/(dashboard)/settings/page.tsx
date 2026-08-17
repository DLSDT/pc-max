'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';

interface Settings {
  announcement: { enabled: boolean; text: string };
  maintenance_mode: { enabled: boolean; message: string };
  min_app_version: { version: string };
  branding: { brand_name: string; primary_color: string; tagline: string; logo_url: string | null };
}

const DEFAULTS: Settings = {
  announcement: { enabled: false, text: '' },
  maintenance_mode: { enabled: false, message: 'Server maintenance in progress.' },
  min_app_version: { version: '0.0.0' },
  branding: { brand_name: 'PC MAX', primary_color: '#E50914', tagline: 'Premium PC Gaming Optimization', logo_url: null },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ data: Record<string, unknown> }>('/admin/settings')
      .then((res) => {
        const raw = res.data;
        setSettings({
          announcement: (raw.announcement as Settings['announcement']) ?? DEFAULTS.announcement,
          maintenance_mode: (raw.maintenance_mode as Settings['maintenance_mode']) ?? DEFAULTS.maintenance_mode,
          min_app_version: (raw.min_app_version as Settings['min_app_version']) ?? DEFAULTS.min_app_version,
          branding: (raw.branding as Settings['branding']) ?? DEFAULTS.branding,
        });
      })
      .catch(() => toast.error('Failed to load settings'));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
      toast.success('Settings published — clients pick them up on next sync');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Remote configuration — changes reach the desktop app on its next sync. No rebuild required.
        </p>
      </div>

      {/* Announcement */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Announcement</h2>
          <Switch
            checked={settings.announcement.enabled}
            onCheckedChange={(enabled) => setSettings({ ...settings, announcement: { ...settings.announcement, enabled } })}
          />
        </div>
        <p className="text-xs text-muted-foreground">Shown prominently in the desktop app while enabled.</p>
        <Textarea
          value={settings.announcement.text}
          onChange={(e) => setSettings({ ...settings, announcement: { ...settings.announcement, text: e.target.value } })}
          placeholder="Welcome to the new season — 20% off the 12-month plan!"
          disabled={!settings.announcement.enabled}
        />
      </section>

      {/* Maintenance mode */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Maintenance mode</h2>
          <Switch
            checked={settings.maintenance_mode.enabled}
            onCheckedChange={(enabled) => setSettings({ ...settings, maintenance_mode: { ...settings.maintenance_mode, enabled } })}
          />
        </div>
        <p className="text-xs text-muted-foreground">While enabled, the desktop app shows this message instead of live data.</p>
        <Input
          value={settings.maintenance_mode.message}
          onChange={(e) => setSettings({ ...settings, maintenance_mode: { ...settings.maintenance_mode, message: e.target.value } })}
          disabled={!settings.maintenance_mode.enabled}
        />
      </section>

      {/* Branding / theme (Phase 15) */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Branding & theme</h2>
        <p className="text-xs text-muted-foreground">Applied by clients on next sync — logo, accent color and copy, no rebuild.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="brand-name" className="text-[11px]">Brand name</Label>
            <Input
              id="brand-name"
              value={settings.branding.brand_name}
              onChange={(e) => setSettings({ ...settings, branding: { ...settings.branding, brand_name: e.target.value } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-color" className="text-[11px]">Accent color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="brand-color"
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(settings.branding.primary_color) ? settings.branding.primary_color : '#E50914'}
                onChange={(e) => setSettings({ ...settings, branding: { ...settings.branding, primary_color: e.target.value } })}
                className="h-9 w-14 cursor-pointer p-1"
              />
              <Input
                value={settings.branding.primary_color}
                onChange={(e) => setSettings({ ...settings, branding: { ...settings.branding, primary_color: e.target.value } })}
                placeholder="#E50914"
                className="h-9 flex-1 font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="brand-tagline" className="text-[11px]">Tagline</Label>
            <Input
              id="brand-tagline"
              value={settings.branding.tagline}
              onChange={(e) => setSettings({ ...settings, branding: { ...settings.branding, tagline: e.target.value } })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="brand-logo" className="text-[11px]">Logo URL (optional — PNG/ICO asset URL)</Label>
            <Input
              id="brand-logo"
              value={settings.branding.logo_url ?? ''}
              onChange={(e) => setSettings({ ...settings, branding: { ...settings.branding, logo_url: e.target.value || null } })}
              placeholder="https://cdn.example.com/logo.png"
            />
          </div>
        </div>
      </section>

      {/* Minimum app version */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Minimum app version</h2>
        <p className="text-xs text-muted-foreground">Clients older than this will be told an update is required.</p>
        <div className="max-w-48">
          <Label htmlFor="min-version" className="mb-1 block text-[11px]">Version (semver)</Label>
          <Input
            id="min-version"
            value={settings.min_app_version.version}
            onChange={(e) => setSettings({ ...settings, min_app_version: { version: e.target.value } })}
            placeholder="0.1.0"
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Publish settings'}
        </Button>
      </div>
    </div>
  );
}
