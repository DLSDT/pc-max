import { AlertCircle, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api';

export function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <AlertCircle className="size-8 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/**
 * Wrapper for admin data tables. Admin tables carry 4-5 columns and are used
 * at desktop widths down to 1280px with the sidebar expanded — without this
 * the table pushes the whole page into horizontal scroll instead of scrolling
 * inside its own card.
 */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export const inputClass = 'rounded-md border border-border bg-background px-3 py-1.5 text-sm';
export const primaryBtnClass =
  'flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50';
export const iconBtnClass =
  'flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-50';
export const dangerBtnClass =
  'flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50';
export const dangerIconBtnClass =
  'flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50';
