'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { apiFetch } from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationDays: number;
  price: number;
  currency: string;
  deviceLimit: number;
  features: string[];
  status: 'active' | 'inactive';
  sortOrder: number;
}

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  durationDays: 30,
  price: 0,
  currency: 'IRR',
  deviceLimit: 1,
  features: '',
  status: 'active' as 'active' | 'inactive',
  sortOrder: 0,
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Plan[] }>('/admin/subscriptions/plans');
      setPlans(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? '',
      durationDays: plan.durationDays,
      price: plan.price,
      currency: plan.currency,
      deviceLimit: plan.deviceLimit,
      features: plan.features.join('\n'),
      status: plan.status,
      sortOrder: plan.sortOrder,
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        description: form.description || undefined,
        durationDays: Number(form.durationDays),
        price: Number(form.price),
        currency: form.currency,
        deviceLimit: Number(form.deviceLimit),
        features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
        status: form.status,
        sortOrder: Number(form.sortOrder),
      };
      if (editing) {
        await apiFetch(`/admin/subscriptions/plans/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast.success('Plan updated');
      } else {
        await apiFetch('/admin/subscriptions/plans', { method: 'POST', body: JSON.stringify(payload) });
        toast.success('Plan created');
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  }

  async function disable(plan: Plan) {
    try {
      await apiFetch(`/admin/subscriptions/plans/${plan.id}`, { method: 'DELETE' });
      toast.success(plan.status === 'active' ? 'Plan disabled' : 'Plan re-enabled');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update plan');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Subscription Plans</h1>
          <p className="text-sm text-muted-foreground">Prices, durations and device limits — managed here, never hardcoded.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Plan
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Devices</TableHead>
              <TableHead>Features</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !plans &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))}
            {plans?.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.slug}</div>
                </TableCell>
                <TableCell>{p.durationDays} days</TableCell>
                <TableCell>
                  {p.price.toLocaleString('en-US')} <span className="text-xs text-muted-foreground">{p.currency}</span>
                </TableCell>
                <TableCell>{p.deviceLimit}</TableCell>
                <TableCell>
                  <div className="flex max-w-64 flex-wrap gap-1">
                    {p.features.map((f) => (
                      <Badge key={f} variant="secondary">{f}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={p.status === 'active' ? 'success' : 'secondary'}>{p.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => disable(p)}>
                      <Power className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {plans && plans.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No plans yet — create your first one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit plan' : 'New plan'}</DialogTitle>
            <DialogDescription>
              Everything about a plan (price, duration, device limit, features) is dynamic.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Name</Label>
                <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="1 Month" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-slug">Slug</Label>
                <Input id="p-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="1-month" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Description</Label>
              <Textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-dur">Duration (days)</Label>
                <Input id="p-dur" type="number" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-price">Price</Label>
                <Input id="p-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-curr">Currency</Label>
                <Input id="p-curr" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-dev">Device limit</Label>
                <Input id="p-dev" type="number" value={form.deviceLimit} onChange={(e) => setForm({ ...form, deviceLimit: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-order">Sort order</Label>
                <Input id="p-order" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-features">Features (one per line)</Label>
              <Textarea
                id="p-features"
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                placeholder={'premium_optimization\nautomatic_hardware_detection\none_click_optimization'}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name || !form.slug}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
