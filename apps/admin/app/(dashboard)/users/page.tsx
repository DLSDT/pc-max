'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Ban, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { apiFetch, fmtDate } from '@/lib/api';

interface UserRow {
  id: string;
  phone: string | null;
  email: string | null;
  username: string | null;
  role: string;
  status: 'active' | 'suspended';
  lastLoginAt: string | null;
  createdAt: string;
}

interface UsersResponse {
  data: UserRow[];
  meta: { page: number; limit: number; total: number };
}

export default function UsersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (q) params.set('q', q);
      if (status !== 'all') params.set('status', status);
      const res = await apiFetch<UsersResponse>(`/admin/users?${params}`);
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, q, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function setUserStatus(userId: string, next: 'active' | 'suspended') {
    try {
      await apiFetch(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      toast.success(next === 'suspended' ? 'User suspended' : 'User activated');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update user');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">{data?.meta.total ?? '…'} registered accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search phone / email / username…"
              className="w-64 pl-8"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
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
            {data?.data.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium" dir="ltr">{u.phone ?? u.email ?? 'anonymous device'}</div>
                  <div className="text-xs text-muted-foreground">@{u.username ?? '—'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{u.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === 'active' ? 'success' : 'destructive'}>{u.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(u.lastLoginAt)}</TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {u.status === 'active' ? (
                      <Button variant="outline" size="sm" onClick={() => setUserStatus(u.id, 'suspended')}>
                        <Ban className="h-4 w-4" /> Suspend
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setUserStatus(u.id, 'active')}>
                        <CheckCircle2 className="h-4 w-4" /> Activate
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {data && data.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No users found.
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
    </div>
  );
}
