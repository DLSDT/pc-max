import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileClock, RotateCcw } from 'lucide-react';
import { useWinOpt } from '@/store/winopt';
import { isTauriShell } from '@/lib/optimizer';
import { Button } from '@/components/ui';

/**
 * Backup & Restore for Windows optimization.
 *
 * This is the single implementation, mounted in two places: inside Windows
 * Optimizer (where a snapshot is created) and in General Settings (where the
 * spec asks for it). Both read the same `useWinOpt` store and the same Rust
 * `windows_snapshots` / `windows_restore` commands — there is no second
 * backup system, only a second entry point.
 *
 * A snapshot is the record of what PC MAX itself changed: the previous value
 * of every registry key, service and startup entry it touched. Restoring puts
 * those back. It is deliberately not a Windows system-image backup, and the
 * copy says so rather than implying a guarantee the code cannot make.
 */
export default function RestorePanel({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const snapshots = useWinOpt((s) => s.snapshots);
  const restore = useWinOpt((s) => s.restore);
  const refresh = useWinOpt((s) => s.refreshSnapshots);
  const busy = useWinOpt((s) => s.status === 'applying');

  // Settings can be opened without ever visiting Windows Optimizer, so the
  // list has to load itself rather than relying on that page's scan.
  useEffect(() => {
    if (isTauriShell()) void refresh();
  }, [refresh]);

  if (!isTauriShell()) {
    return <p className="text-sm text-muted-foreground">{t('winopt.desktopOnly')}</p>;
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
        <FileClock aria-hidden className="size-5 shrink-0" />
        {t('winopt.noSnapshots')}
      </div>
    );
  }

  const list = compact ? snapshots.slice(0, 5) : snapshots;

  return (
    <div className="space-y-2.5">
      {list.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {t(`winopt.profile.${s.profile}`)} · {t('winopt.changes', { count: s.changeCount })}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {new Date(Number(s.createdAt)).toLocaleString()} — {s.tweaks.join(', ')}
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void restore(s.id)} className="gap-1.5">
            <RotateCcw aria-hidden className="size-3.5" />
            {t('winopt.restore')}
          </Button>
        </div>
      ))}
    </div>
  );
}
