'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiFetch, fmtDate } from '@/lib/api';
import type { AdminGameListResponse } from '@goh/types';

export default function GamesPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [data, setData] = useState<AdminGameListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<AdminGameListResponse>(`/admin/games?page=${page}&limit=25&q=${encodeURIComponent(q)}`);
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function togglePublish(gameId: string, current: 'draft' | 'published' | 'archived') {
    const next = current === 'published' ? 'draft' : 'published';
    try {
      await apiFetch(`/admin/games/${gameId}/publish`, { method: 'POST', body: JSON.stringify({ status: next }) });
      toast.success(next === 'published' ? 'Game published' : 'Game unpublished');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    }
  }

  async function removeGame() {
    if (!toDelete) return;
    try {
      await apiFetch(`/admin/games/${toDelete}`, { method: 'DELETE' });
      toast.success('Game deleted');
      setToDelete(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Games</h1>
          <p className="text-sm text-muted-foreground">{data?.meta.total ?? '…'} games in the library</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search games…" className="w-56 pl-8" />
          </div>
          <Button onClick={() => router.push('/games/new')}>
            <Plus className="h-4 w-4" /> Add Game
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Game</TableHead>
              <TableHead>Genres</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Profiles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data && (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))
            )}
            {data?.data.map((g) => (
              <TableRow key={g.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-8 overflow-hidden rounded bg-secondary">
                      {g.coverUrl && <img src={g.coverUrl} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div>
                      <Link href={`/games/${g.id}`} className="font-medium hover:text-primary">
                        {g.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{g.slug}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {g.genres.map((c) => (
                      <Badge key={c.slug} variant="secondary">{c.name}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{g.performanceRating}</TableCell>
                <TableCell>{g.profileCount}</TableCell>
                <TableCell>
                  <Badge variant={g.status === 'published' ? 'success' : g.status === 'draft' ? 'secondary' : 'destructive'}>
                    {g.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(g.updatedAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => togglePublish(g.id, g.status)}>
                      {g.status === 'published' ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => router.push(`/games/${g.id}`)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(g.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {data && data.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No games found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.meta.total > data.meta.limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {data.meta.page} of {Math.max(1, Math.ceil(data.meta.total / data.meta.limit))}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * data.meta.limit >= data.meta.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete game?"
        description="This soft-deletes the game. It will no longer appear in the desktop app."
        onOpenChange={(o) => !o && setToDelete(null)}
        onConfirm={removeGame}
      />
    </div>
  );
}
