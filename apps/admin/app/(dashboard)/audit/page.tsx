'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, fmtDate } from '@/lib/api';
import type { AuditLogListResponse } from '@goh/types';

export default function AuditPage() {
  const [data, setData] = useState<AuditLogListResponse | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch<AuditLogListResponse>(`/admin/audit-logs?page=${page}&limit=25&q=${encodeURIComponent(q)}`)
        .then(setData)
        .catch((e) => toast.error(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-sm text-muted-foreground">Every admin mutation, recorded</p>
        </div>
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Filter by action…" className="w-56" />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ))}
            {data?.data.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{fmtDate(r.createdAt)} {new Date(r.createdAt).toLocaleTimeString()}</TableCell>
                <TableCell>{r.admin ? r.admin.email : <span className="text-muted-foreground">system</span>}</TableCell>
                <TableCell><Badge variant="secondary">{r.action}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.entityType}{r.entityId ? ` · ${r.entityId.slice(0, 8)}…` : ''}</TableCell>
                <TableCell className="text-muted-foreground">{r.ip ?? '—'}</TableCell>
              </TableRow>
            ))}
            {data && data.data.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No audit entries.</TableCell></TableRow>
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
    </div>
  );
}
