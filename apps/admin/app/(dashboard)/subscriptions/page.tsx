'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Ban, Gift } from 'lucide-react';
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

interface SubscriptionRow {
  id: string;
  status: string;
  startDate: string;
  expirationDate: string;
  createdAt: string;
  userEmail: string | null;
  planName: string;
  planDurationDays: number;
}

interface SubsResponse {
  data: SubscriptionRow[];
  meta: { page: number; limit: number; total: number };
}

interface Plan {
  id: string;
  name: string;
  status: string;
}

export default function SubscriptionsPage() {
  const [data, setData] = useState<SubsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grant, setGrant] = useState({ email: '', planId: '', durationDays: '' });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (status !== 'all') params.set('status', status);
      const res = await apiFetch<SubsResponse>(`/admin/subscriptions?${params}`);
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!grantOpen) return;
    apiFetch<{ data: Plan[] }>('/admin/subscriptions/plans')
      .then((res) => setPlans(res.data.filter((p) => p.status === 'active')))
      .catch(() => toast.error('Failed to load plans'));
  }, [grantOpen]);

  async function patchSub(id: string, body: Record<string, unknown>) {
    try {
      await apiFetch(`/admin/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast.success('Subscription updated');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update subscription');
    }
  }

  async function grantSubscription() {
    if (!grant.email || !grant.planId) return;
    setSaving(true);
    try {
      // Resolve email → userId via the users search.
      const users = await apiFetch<{ data: { id: string; email: string | null }[] }>(
        `/admin/users?q=${encodeURIComponent(grant.email)}&limit=5`,
      );
      const match = users.data.find((u) => u.email?.toLowerCase() === grant.email.toLowerCase());
      if (!match) {
        toast.error('No user found with that email');
        return;
      }
      await apiFetch('/admin/payments/manual-grant', {
        method: 'POST',
        body: JSON.stringify({
          userId: match.id,
          planId: grant.planId,
          ...(grant.durationDays ? { durationDays: Number(grant.durationDays) } : {}),
        }),
      });
      toast.success('Subscription granted');
      setGrantOpen(false);
      setGrant({ email: '', planId: '', durationDays: '' });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to grant subscription');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">{data?.meta.total ?? '…'} subscriptions</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setGrantOpen(true)}>
            <Gift className="h-4 w-4" /> Manual Grant
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Expires</TableHead>
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
            {data?.data.map((s) => {
              const expired = s.status === 'active' && new Date(s.expirationDate) < new Date();
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.userEmail ?? '—'}</TableCell>
                  <TableCell>{s.planName}</TableCell>
                  <TableCell>
                    <Badge variant={expired ? 'destructive' : s.status === 'active' ? 'success' : 'secondary'}>
                      {expired ? 'expired' : s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(s.startDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(s.expirationDate)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={s.status !== 'active'}
                        onClick={() => patchSub(s.id, { extendDays: 30 })}
                      >
                        <CalendarPlus className="h-4 w-4" /> +30d
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={s.status === 'cancelled' || s.status === 'expired'}
                        onClick={() => patchSub(s.id, { status: 'cancelled' })}
                      >
                        <Ban className="h-4 w-4" /> Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {data && data.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No subscriptions found.
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

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual subscription grant</DialogTitle>
            <DialogDescription>Grant a subscription to a user without a payment (support flow).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-email">User email</Label>
              <Input id="g-email" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} placeholder="user@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-plan">Plan</Label>
              <Select value={grant.planId} onValueChange={(v) => setGrant({ ...grant, planId: v })}>
                <SelectTrigger id="g-plan">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-days">Duration (days, optional — default = plan)</Label>
              <Input id="g-days" type="number" value={grant.durationDays} onChange={(e) => setGrant({ ...grant, durationDays: e.target.value })} placeholder="30" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantOpen(false)}>Cancel</Button>
            <Button onClick={grantSubscription} disabled={saving || !grant.email || !grant.planId}>
              {saving ? 'Granting…' : 'Grant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
