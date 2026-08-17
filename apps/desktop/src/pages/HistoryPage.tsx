import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, FileClock, Gamepad2, RotateCcw, Wrench, XCircle } from 'lucide-react';
import { getApplied } from '@/lib/backup';
import { useWinOpt } from '@/store/winopt';
import { Section } from '@/components/Section';
import { Badge, Button } from '@/components/ui';

export default function HistoryPage() {
  const { t } = useTranslation();
  const { snapshots, refreshSnapshots, restore } = useWinOpt();

  useEffect(() => {
    void refreshSnapshots();
  }, [refreshSnapshots]);

  const gameHistory = getApplied();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('history.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('history.subtitle')}</p>
      </header>

      {/* Game optimizations */}
      <Section title={t('history.gameOptimizations')}>
        {gameHistory.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
            <Gamepad2 aria-hidden className="size-5" />
            {t('history.noGameHistory')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {gameHistory.map((g) => (
              <div key={`${g.gameSlug}-${g.appliedAt}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-5">
                  <Gamepad2 aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{g.gameName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('history.package', { package: g.packageName })} · v{g.version} ·{' '}
                    {new Date(g.appliedAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant="success">{t('history.applied')}</Badge>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Windows optimizations */}
      <Section title={t('history.windowsOptimizations')}>
        {snapshots.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
            <Wrench aria-hidden className="size-5" />
            {t('history.noWindowsHistory')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {snapshots.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-5">
                  <FileClock aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {t(`winopt.profile.${s.profile}`)} · {t('history.changes', { count: s.changeCount })}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {new Date(Number(s.createdAt)).toLocaleString()} — {s.tweaks.join(', ')}
                  </p>
                </div>
                <Badge variant="success">{t('history.committed')}</Badge>
                <Button size="sm" variant="outline" onClick={() => void restore(s.id)} className="gap-1.5">
                  <RotateCcw aria-hidden className="size-3.5" />
                  {t('history.restore')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* System / recovery info */}
      <Section title={t('history.system')}>
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {t('history.systemHint')}
        </div>
      </Section>
    </div>
  );
}
