'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileUp, Rocket, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, uploadFile } from '@/lib/api';

interface PackageDetail {
  id: string;
  gameId: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  status: string;
  gpuVendor: string;
  gpuFamily: string | null;
  minVramMb: number | null;
  minRamGb: number | null;
  minWindows: string | null;
  gameVersion: string | null;
  arch: string;
  targetResolution: string | null;
  targetFps: number | null;
  isDefault: boolean;
}

interface FileRow {
  id: string;
  filename: string;
  sha256: string;
  size: number;
  destination: string;
  operation: string;
}

interface VersionRow {
  id: string;
  version: string;
  changeNote: string | null;
  files: { filename: string; sha256: string; destination: string }[];
  createdAt: string;
}

export default function PackageEditorPage() {
  const { id = '' } = useParams();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<PackageDetail>>({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingDest, setPendingDest] = useState('');
  const [versions, setVersions] = useState<VersionRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pkgRes, filesRes, versionsRes] = await Promise.all([
        apiFetch<PackageDetail>(`/admin/packages/${id}`),
        apiFetch<{ data: FileRow[] }>(`/admin/packages/${id}/files`),
        apiFetch<{ data: VersionRow[] }>(`/admin/packages/${id}/versions`).catch(() => ({ data: [] })),
      ]);
      void pkgRes;
      setPkg(pkgRes);
      setForm(pkgRes);
      setFiles(filesRes.data);
      setVersions(versionsRes.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load package');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/admin/packages/${id}`, { method: 'PATCH', body: JSON.stringify(form) });
      toast.success('Package updated');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const res = await apiFetch<PackageDetail>(`/admin/packages/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ changeNote: changeNote || undefined }),
      });
      toast.success(`Published as v${res.version}`);
      setChangeNote('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  }

  async function onUpload(e: FormEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // 1. presign → 2. PUT bytes → 3. complete (server computes SHA-256).
      const presigned = await apiFetch<{ uploadUrl: string; objectKey: string }>(`/admin/packages/${id}/files/presign`, {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, size: file.size }),
      });
      await uploadFile(presigned.uploadUrl, file);
      await apiFetch(`/admin/packages/${id}/files/complete`, {
        method: 'POST',
        body: JSON.stringify({
          storageKey: presigned.objectKey,
          filename: file.name,
          size: file.size,
          destination: pendingDest.trim() || file.name,
          operation: 'replace',
        }),
      });
      toast.success(`Uploaded ${file.name} — SHA-256 verified`);
      setPendingDest('');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.currentTarget.value = '';
    }
  }

  async function removeFile(fileId: string) {
    try {
      await apiFetch(`/admin/packages/${id}/files/${fileId}`, { method: 'DELETE' });
      toast.success('File removed');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove file');
    }
  }

  if (loading && !pkg) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!pkg) return <p className="text-sm text-muted-foreground">Package not found.</p>;

  const num = (v: string | undefined | null) => (v === '' || v === undefined || v === null ? undefined : Number(v));

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/packages" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> All packages
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{pkg.name}</h1>
            <Badge variant={pkg.status === 'published' ? 'success' : pkg.status === 'draft' ? 'secondary' : 'destructive'}>
              {pkg.status}
            </Badge>
            <Badge variant="outline">v{pkg.version}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{pkg.slug}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void save()} disabled={saving || !form.name || !form.slug}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button onClick={() => void publish()} disabled={publishing || files.length === 0}>
            <Rocket className="h-4 w-4" />
            {publishing ? 'Publishing…' : 'Publish'}
          </Button>
        </div>
      </div>

      {/* Metadata + compatibility */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Package & compatibility</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="e-name">Name</Label>
            <Input id="e-name" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-slug">Slug</Label>
            <Input id="e-slug" value={form.slug ?? ''} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="e-desc">Description</Label>
            <Textarea id="e-desc" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>GPU vendor</Label>
            <Select value={form.gpuVendor ?? 'any'} onValueChange={(v) => setForm({ ...form, gpuVendor: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="nvidia">NVIDIA</SelectItem>
                <SelectItem value="amd">AMD</SelectItem>
                <SelectItem value="intel">Intel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-family">GPU family</Label>
            <Input id="e-family" value={form.gpuFamily ?? ''} onChange={(e) => setForm({ ...form, gpuFamily: e.target.value })} placeholder="rtx-30" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-vram">Min VRAM (MB)</Label>
            <Input id="e-vram" type="number" value={form.minVramMb ?? ''} onChange={(e) => setForm({ ...form, minVramMb: num(e.target.value) })} placeholder="4096" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-ram">Min RAM (GB)</Label>
            <Input id="e-ram" type="number" value={form.minRamGb ?? ''} onChange={(e) => setForm({ ...form, minRamGb: num(e.target.value) })} placeholder="8" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-win">Min Windows</Label>
            <Input id="e-win" value={form.minWindows ?? ''} onChange={(e) => setForm({ ...form, minWindows: e.target.value })} placeholder="10.0.19041" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-gamever">Game version</Label>
            <Input id="e-gamever" value={form.gameVersion ?? ''} onChange={(e) => setForm({ ...form, gameVersion: e.target.value })} placeholder="1.0.0" />
          </div>
          <div className="space-y-1.5">
            <Label>Architecture</Label>
            <Select value={form.arch ?? 'any'} onValueChange={(v) => setForm({ ...form, arch: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="x64">x64</SelectItem>
                <SelectItem value="arm64">arm64</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-res">Target resolution</Label>
            <Input id="e-res" value={form.targetResolution ?? ''} onChange={(e) => setForm({ ...form, targetResolution: e.target.value })} placeholder="1080p" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-fps">Target FPS</Label>
            <Input id="e-fps" type="number" value={form.targetFps ?? ''} onChange={(e) => setForm({ ...form, targetFps: num(e.target.value) })} placeholder="60" />
          </div>
        </div>
      </section>

      {/* Files */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Package files (manifest)</h2>
        <p className="text-xs text-muted-foreground">
          Every file is uploaded to object storage, hashed server-side (SHA-256) and installed only through the manifest. Executables and scripts are rejected.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={pendingDest}
            onChange={(e) => setPendingDest(e.target.value)}
            placeholder="Destination inside game dir (default: filename)"
            className="max-w-xs"
          />
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploading…' : 'Upload file'}
            <input type="file" className="hidden" onChange={(e) => void onUpload(e)} disabled={uploading} />
          </label>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Op</TableHead>
                <TableHead>SHA-256</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">{f.filename}</TableCell>
                  <TableCell>{(f.size / 1024 / 1024).toFixed(1)} MB</TableCell>
                  <TableCell className="font-mono text-xs">{f.destination}</TableCell>
                  <TableCell><Badge variant="outline">{f.operation}</Badge></TableCell>
                  <TableCell className="max-w-28 truncate font-mono text-[10px] text-muted-foreground" title={f.sha256}>
                    {f.sha256.slice(0, 16)}…
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="icon" onClick={() => void removeFile(f.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {files.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    <FileUp className="mx-auto mb-2 h-6 w-6" />
                    No files yet — upload the first file to build the manifest.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {files.length > 0 && (
          <div className="rounded-lg border border-border bg-background/40 p-3 text-xs text-muted-foreground">
            <Label htmlFor="change-note" className="mb-1 block text-[11px] font-medium">Change note (shown in the version history)</Label>
            <div className="flex gap-2">
              <Input id="change-note" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="Fixed DLSS preset for RTX 30 series" />
              <Button size="sm" onClick={() => void publish()} disabled={publishing}>
                <Rocket className="h-3.5 w-3.5" /> Release v{pkg.version.split('.').map((n, i) => (i === 2 ? Number(n) + 1 : n)).join('.')}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Release history */}
      {versions.length > 0 && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Release history</h2>
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">v{v.version}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">{v.files.length} file(s)</span>
                </div>
                {v.changeNote && <p className="mt-1 text-xs text-muted-foreground">{v.changeNote}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
