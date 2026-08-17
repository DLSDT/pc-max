'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ImagePlus, Settings2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { GameForm } from '@/components/game-form';
import { apiFetch, uploadFile } from '@/lib/api';
import type { GameDetail, GameRequirement, OptimizationProfile, PresignUploadResponse } from '@goh/types';

const IMAGE_KINDS = [
  { type: 'cover', label: 'Cover' },
  { type: 'background', label: 'Background' },
  { type: 'logo', label: 'Logo' },
] as const;

export default function GameEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [game, setGame] = useState<GameDetail | null>(null);
  const [profiles, setProfiles] = useState<OptimizationProfile[]>([]);
  const [requirements, setRequirements] = useState<Record<string, Partial<GameRequirement>>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [toDeleteImage, setToDeleteImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<(typeof IMAGE_KINDS)[number]['type']>('cover');

  const load = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([
        apiFetch<GameDetail>(`/admin/games/${id}`),
        apiFetch<{ data: OptimizationProfile[] }>(`/admin/games/${id}/profiles`),
      ]);
      setGame(g);
      setProfiles(p.data);
      const reqs: Record<string, Partial<GameRequirement>> = {};
      for (const r of g.requirements) {
        const { tier, ...rest } = r;
        reqs[tier] = rest;
      }
      setRequirements(reqs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load game');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFilePicked(file: File) {
    if (!file || !game) return;
    setUploading(uploadKind);
    try {
      const presign = await apiFetch<PresignUploadResponse>('/admin/uploads/presign', {
        method: 'POST',
        noRetry: true,
        body: JSON.stringify({ kind: uploadKind, contentType: file.type, size: file.size }),
      });
      await uploadFile(presign.uploadUrl, file);
      await apiFetch(`/admin/games/${game.id}/images`, {
        method: 'POST',
        noRetry: true,
        body: JSON.stringify({ type: uploadKind, objectKey: presign.objectKey, altText: game.name }),
      });
      toast.success('Image uploaded');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  async function deleteImage(imageId: string) {
    try {
      await apiFetch(`/admin/games/${id}/images/${imageId}`, { method: 'DELETE' });
      toast.success('Image removed');
      setToDeleteImage(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove image');
    }
  }

  async function saveRequirements() {
    try {
      await apiFetch(`/admin/games/${id}/requirements`, {
        method: 'PUT',
        body: JSON.stringify({
          minimum: requirements.minimum && requirements.minimum.cpu ? requirements.minimum : undefined,
          recommended: requirements.recommended && requirements.recommended.cpu ? requirements.recommended : undefined,
        }),
      });
      toast.success('Requirements saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save requirements');
    }
  }

  if (!game) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{game.name}</h1>
          <p className="text-sm text-muted-foreground">{game.slug} · updated {new Date(game.updatedAt).toLocaleDateString()}</p>
        </div>
        <Badge variant={game.status === 'published' ? 'success' : 'secondary'}>{game.status}</Badge>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Images</CardTitle>
          <div className="flex items-center gap-2">
            {IMAGE_KINDS.map((k) => (
              <Button key={k.type} variant={uploadKind === k.type ? 'default' : 'outline'} size="sm" onClick={() => setUploadKind(k.type)}>
                {k.label}
              </Button>
            ))}
            <Button size="sm" disabled={uploading !== null} onClick={() => fileRef.current?.click()}>
              {uploading ? <Upload className="h-4 w-4 animate-pulse" /> : <ImagePlus className="h-4 w-4" />}
              Upload
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFilePicked(f);
                e.target.value = '';
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {game.images.map((img) => (
              <div key={img.id} className="group relative overflow-hidden rounded-md border">
                <img src={img.url} alt={img.altText ?? img.type} className="aspect-[3/4] w-full object-cover" />
                <div className="absolute left-1 top-1">
                  <Badge variant="secondary">{img.type}</Badge>
                </div>
                <button
                  className="absolute right-1 top-1 hidden rounded bg-destructive/90 p-1 text-white group-hover:block"
                  onClick={() => setToDeleteImage(img.id)}
                  aria-label="Delete image"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {game.images.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No images yet. Upload a cover to get started.</p>}
          </div>
        </CardContent>
      </Card>

      <GameForm initial={game} onSaved={setGame} />

      <Card>
        <CardHeader><CardTitle className="text-base">System Requirements</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {(['minimum', 'recommended'] as const).map((tier) => (
            <div key={tier} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-4">
                <Label className="capitalize">{tier}</Label>
              </div>
              {(
                [
                  ['os', 'OS'], ['cpu', 'CPU'], ['gpu', 'GPU'], ['ramGb', 'RAM (GB)'],
                  ['storageGb', 'Storage (GB)'], ['directx', 'DirectX'],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    value={requirements[tier]?.[field] ?? ''}
                    onChange={(e) =>
                      setRequirements((r) => ({ ...r, [tier]: { ...r[tier], [field]: field === 'ramGb' || field === 'storageGb' ? Number(e.target.value) : e.target.value } }))
                    }
                  />
                </div>
              ))}
              <div className="sm:col-span-2 lg:col-span-4">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  rows={2}
                  value={requirements[tier]?.notes ?? ''}
                  onChange={(e) => setRequirements((r) => ({ ...r, [tier]: { ...r[tier], notes: e.target.value } }))}
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={saveRequirements}>Save requirements</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Optimization Profiles</CardTitle>
          <Link href={`/games/${id}/profiles/new`}>
            <Button size="sm"><Settings2 className="h-4 w-4" /> New profile</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {profiles.map((p) => (
              <Link key={p.id} href={`/profiles/${p.id}`} className="rounded-lg border p-4 transition-colors hover:border-primary/40">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{p.name}</div>
                  <Badge variant={p.status === 'published' ? 'success' : 'secondary'}>{p.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {p.targetFps ? `${p.targetFps} FPS` : '—'} · v{p.version} · {p.settings.length} settings
                  {p.isDefault && ' · default'}
                </div>
              </Link>
            ))}
            {profiles.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No profiles yet.</p>}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(toDeleteImage)}
        title="Remove image?"
        description="The image will be removed from the game."
        onOpenChange={(o) => !o && setToDeleteImage(null)}
        onConfirm={() => toDeleteImage && void deleteImage(toDeleteImage)}
      />
    </div>
  );
}
