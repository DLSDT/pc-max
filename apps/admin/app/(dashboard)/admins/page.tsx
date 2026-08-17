'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiFetch, fmtDate } from '@/lib/api';

interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLES = ['super_admin', 'admin', 'editor', 'viewer'] as const;

export default function AdminsPage() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'editor' as string });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: AdminRow[] }>('/admin/admins');
      setRows(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    setSaving(true);
    try {
      await apiFetch('/admin/admins', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Admin created');
      setOpen(false);
      setForm({ email: '', name: '', password: '', role: 'editor' });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/admin/admins/${id}`, { method: 'DELETE' });
      toast.success('Admin removed');
      setToDelete(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admins</h1>
          <p className="text-sm text-muted-foreground">Role-based access control (super admin only)</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add admin</Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ))}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.email}</TableCell>
                <TableCell>
                  <Badge variant={r.role === 'super_admin' ? 'default' : 'secondary'}>{r.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={r.isActive ? 'success' : 'destructive'}>{r.isActive ? 'active' : 'disabled'}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(r.lastLoginAt)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(r.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add admin</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={create} disabled={saving || !form.email || !form.name || form.password.length < 8}>
                {saving ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={Boolean(toDelete)} title="Remove admin?" description="They will lose access immediately." onOpenChange={(o) => !o && setToDelete(null)} onConfirm={() => toDelete && void remove(toDelete)} />
    </div>
  );
}
