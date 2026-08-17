'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiFetch } from '@/lib/api';

export interface Column {
  key: string;
  label: string;
  /** Render custom cell content. */
  render?: (row: Record<string, unknown>) => React.ReactNode;
}

interface CrudTableProps {
  title: string;
  description?: string;
  endpoint: string;
  columns: Column[];
  /** Fields shown in the create/edit dialog. */
  fields: { name: string; label: string; type?: 'text' | 'number' | 'textarea' }[];
  onSaved?: () => void;
}

export function CrudTable({ title, description, endpoint, columns, fields, onSaved }: CrudTableProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Record<string, unknown>[] }>(endpoint);
      setRows(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({});
    setDialogOpen(true);
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row);
    const next: Record<string, string> = {};
    for (const f of fields) next[f.name] = String(row[f.name] ?? '');
    setForm(next);
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`${endpoint}/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
        toast.success('Updated');
      } else {
        await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(form) });
        toast.success('Created');
      }
      setDialogOpen(false);
      void load();
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    try {
      await apiFetch(`${endpoint}/${toDelete}`, { method: 'DELETE' });
      toast.success('Deleted');
      setToDelete(null);
      void load();
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add</Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !rows.length && (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={columns.length + 1}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            )}
            {rows.map((row) => (
              <TableRow key={String(row.id)}>
                {columns.map((c) => (
                  <TableCell key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? '—')}</TableCell>
                ))}
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(String(row.id))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={columns.length + 1} className="py-8 text-center text-sm text-muted-foreground">Nothing here yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${title.slice(0, -1)}` : `Add ${title.slice(0, -1)}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={`f-${f.name}`}>{f.label}</Label>
                {f.type === 'textarea' ? (
                  <textarea
                    id={`f-${f.name}`}
                    className="flex min-h-[70px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    value={form[f.name] ?? ''}
                    onChange={(e) => setForm((x) => ({ ...x, [f.name]: e.target.value }))}
                  />
                ) : (
                  <Input
                    id={`f-${f.name}`}
                    type={f.type ?? 'text'}
                    value={form[f.name] ?? ''}
                    onChange={(e) => setForm((x) => ({ ...x, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={Boolean(toDelete)} title="Delete?" description="This action cannot be undone." onOpenChange={(o) => !o && setToDelete(null)} onConfirm={remove} />
    </div>
  );
}
