'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
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
import { apiFetch, fmtDate } from '@/lib/api';

interface AttemptRow {
  id: number;
  email: string;
  ip: string | null;
  success: boolean;
  accountExists: boolean;
  attemptedAt: string;
}

export default function SecurityPage() {
  const [data, setData] = useState<{ data: AttemptRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: AttemptRow[] }>('/admin/security/login-attempts?limit=100');
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load attempts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const failed = data?.data.filter((a) => !a.success).length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Security</h1>
        <p className="text-sm text-muted-foreground">
          Recent login attempts — {failed} failed in the latest 100 (lockout: 5 failures within 15 minutes).
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Account exists</TableHead>
              <TableHead>Attempted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))}
            {data?.data.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.email}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{a.ip ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={a.success ? 'success' : 'destructive'}>{a.success ? 'success' : 'failed'}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={a.accountExists ? 'default' : 'secondary'}>
                    {a.accountExists ? 'yes' : 'no (enumeration probe)'}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(a.attemptedAt)}</TableCell>
              </TableRow>
            ))}
            {data && data.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No login attempts recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
