'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  providerRef: string | null;
  createdAt: string;
  userEmail: string | null;
  planName: string;
}

interface PaymentsResponse {
  data: PaymentRow[];
  meta: { page: number; limit: number; total: number };
}

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'secondary' | 'outline'> = {
  paid: 'success',
  pending: 'secondary',
  failed: 'destructive',
  expired: 'outline',
  refunded: 'outline',
};

export default function PaymentsPage() {
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<PaymentsResponse>(`/admin/payments?page=${page}&limit=25`);
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground">{data?.meta.total ?? '…'} transactions</p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Date</TableHead>
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
                <TableCell className="font-medium">{p.userEmail ?? '—'}</TableCell>
                <TableCell>{p.planName}</TableCell>
                <TableCell>
                  {p.amount.toLocaleString('en-US')} <span className="text-xs text-muted-foreground">{p.currency}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{p.provider}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'}>{p.status}</Badge>
                </TableCell>
                <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground" title={p.providerRef ?? ''}>
                  {p.providerRef ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(p.createdAt)}</TableCell>
              </TableRow>
            ))}
            {data && data.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No payments yet.
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
