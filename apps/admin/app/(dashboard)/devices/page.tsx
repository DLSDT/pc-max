'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
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

interface DeviceRow {
  id: string;
  deviceId: string;
  name: string | null;
  platform: string;
  lastSeenAt: string | null;
  createdAt: string;
  userEmail: string | null;
}

export default function DevicesPage() {
  const [data, setData] = useState<{ data: DeviceRow[]; meta: { total: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (q) params.set('q', q);
      const res = await apiFetch<{ data: DeviceRow[]; meta: { total: number } }>(`/admin/devices?${params}`);
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function revoke(id: string) {
    try {
      await apiFetch(`/admin/devices/${id}/revoke`, { method: 'POST' });
      toast.success('Device revoked');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke device');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Devices</h1>
          <p className="text-sm text-muted-foreground">{data?.meta.total ?? '…'} registered devices</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by email…" className="w-64 pl-8" />
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))}
            {data?.data.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <div className="font-mono text-xs font-medium">{d.deviceId.slice(0, 24)}…</div>
                  {d.name && <div className="text-xs text-muted-foreground">{d.name}</div>}
                </TableCell>
                <TableCell>{d.userEmail ?? '—'}</TableCell>
                <TableCell><Badge variant="outline">{d.platform}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(d.lastSeenAt)}</TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(d.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => void revoke(d.id)}>
                      <Ban className="h-4 w-4" /> Revoke
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {data && data.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No registered devices.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.meta.total > 25 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {Math.max(1, Math.ceil(data.meta.total / 25))}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 25 >= data.meta.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
