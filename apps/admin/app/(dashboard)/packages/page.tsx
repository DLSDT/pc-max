'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PackageOpen, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, fmtDate } from '@/lib/api';

interface PkgRow {
  id: string;
  gameId: string;
  gameName: string;
  name: string;
  slug: string;
  version: string;
  status: string;
  gpuVendor: string;
  gpuFamily: string | null;
  targetResolution: string | null;
  targetFps: number | null;
  updatedAt: string;
}

interface GamesResp {
  data: { id: string; name: string }[];
}

export default function PackagesPage() {
  const router = useRouter();
  const [data, setData] = useState<{ data: PkgRow[]; meta: { total: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [games, setGames] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ gameId: '', name: '', slug: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (status !== 'all') params.set('status', status);
      const res = await apiFetch<{ data: PkgRow[]; meta: { total: number } }>(`/admin/packages?${params}`);
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openCreate() {
    setCreateOpen(true);
    try {
      const res = await apiFetch<GamesResp>('/admin/games?limit=100');
      setGames(res.data);
      if (!form.gameId && res.data[0]) setForm((f) => ({ ...f, gameId: res.data[0]!.id }));
    } catch {
      toast.error('Failed to load games');
    }
  }

  async function create() {
    if (!form.gameId || !form.name || !form.slug) return;
    setSaving(true);
    try {
      const res = await apiFetch<PkgRow>('/admin/packages', {
        method: 'POST',
        body: JSON.stringify({ gameId: form.gameId, name: form.name, slug: form.slug }),
      });
      toast.success('Package created');
      setCreateOpen(false);
      router.push(`/packages/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create package');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Optimization Packages</h1>
          <p className="text-sm text-muted-foreground">{data?.meta.total ?? '…'} packages — files, manifests and GPU compatibility</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => void openCreate()}>
            <Plus className="h-4 w-4" /> New Package
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package</TableHead>
              <TableHead>Game</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Compatibility</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))}
            {data?.data.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/packages/${p.id}`} className="flex items-center gap-2 font-medium hover:text-primary">
                    <PackageOpen className="h-4 w-4 text-muted-foreground" />
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{p.slug}</div>
                </TableCell>
                <TableCell>{p.gameName}</TableCell>
                <TableCell>
                  {[p.targetResolution, p.targetFps ? `${p.targetFps} FPS` : null].filter(Boolean).join(' · ') || '—'}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{p.gpuVendor}</Badge>
                    {p.gpuFamily && <Badge variant="outline">{p.gpuFamily}</Badge>}
                  </div>
                </TableCell>
                <TableCell>v{p.version}</TableCell>
                <TableCell>
                  <Badge variant={p.status === 'published' ? 'success' : p.status === 'draft' ? 'secondary' : 'destructive'}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(p.updatedAt)}</TableCell>
              </TableRow>
            ))}
            {data && data.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No packages yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New optimization package</DialogTitle>
            <DialogDescription>Files and compatibility are configured in the editor.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-game">Game</Label>
              <Select value={form.gameId} onValueChange={(v) => setForm({ ...form, gameId: v })}>
                <SelectTrigger id="pkg-game">
                  <SelectValue placeholder="Select game" />
                </SelectTrigger>
                <SelectContent>
                  {games.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-name">Name</Label>
              <Input id="pkg-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="NVIDIA RTX 30 High FPS" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-slug">Slug</Label>
              <Input id="pkg-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="rtx30-high-fps" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void create()} disabled={saving || !form.gameId || !form.name || !form.slug}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
