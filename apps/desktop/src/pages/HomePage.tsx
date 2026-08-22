import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Cpu, Gauge, HardDrive, MemoryStick, MonitorCog, ScanSearch, Shapes, Wrench, Zap } from 'lucide-react';
import { useHome } from '@/hooks/useLibrary';
import { Badge, Button, EmptyState } from '@/components/ui';
import { CardSkeleton } from '@/components/CardSkeleton';
import GameCard from '@/components/GameCard';
import HardwarePanel from '@/components/HardwarePanel';
import { GameGrid, Section } from '@/components/Section';
import { useHardware } from '@/store/hardware';
import { gpuLabel } from '@/lib/hardware';
import { getApplied } from '@/lib/backup';
import { ApiError } from '@/lib/api';
import { useWinOpt, computeScore as winScore } from '@/store/winopt';
import { useLibrary } from '@/store/library';

/**
 * Dashboard score from detected hardware + applied optimizations.
 *
 * Scored on RAM and VRAM because those are the two numeric values detection
 * actually returns. It used to read a core count out of `cpu` with parseInt —
 * but `cpu` holds a processor NAME ("Intel(R) Core(TM) i7-12700K"), so that
 * term was only ever non-zero for the browser fallback's "16 logical
 * processors" string, and would have silently scored 0 against real hardware.
 */
function dashboardScore(
  hw: { profile: { ramGb?: number | null; vramMb?: number | null } | null },
  gameApplied: number,
  windowsApplied: number,
) {
  const p = hw.profile;
  if (!p) return null;
  const ram = p.ramGb ?? 0;
  const vram = p.vramMb ?? 0;
  // Nothing measurable yet — a score built from two zeroes says nothing.
  if (ram === 0 && vram === 0) return null;
  const base = 30 + Math.min(ram, 32) * (30 / 32) + Math.min(vram, 16384) * (20 / 16384);
  const score = Math.round(Math.min(100, base + (gameApplied > 0 ? 10 : 0) + (windowsApplied > 0 ? 10 : 0)));
  const label = score >= 85 ? 'excellent' : score >= 65 ? 'good' : score >= 45 ? 'fair' : 'attention';
  return { score, label };
}

export default function HomePage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useHome();
  const hw = useHardware();
  const library = useLibrary((s) => s.games);
  const winOptScan = useWinOpt((s) => s.scan);
  const scanSystem = useWinOpt((s) => s.scanSystem);

  // Staleness-guarded in the store: the first visit scans (real detection),
  // subsequent visits within the window reuse the cached result — no repeated
  // subprocess detection, no status flicker on navigation.
  useEffect(() => {
    void scanSystem();
  }, [scanSystem]);

  const gameApplied = getApplied().length;
  const windowsApplied = winOptScan?.appliedIds.length ?? 0;

  // Truthful catalog error text — network failures get a clear explanation
  // instead of a generic "Something went wrong".
  const catalogError =
    isError && !data
      ? error instanceof ApiError && error.kind !== 'http'
        ? error.message
        : t('common.serviceUnavailable')
      : null;

  const score = useMemo(() => dashboardScore(hw, gameApplied, windowsApplied), [hw.profile, gameApplied, windowsApplied]);
  const winScoreResult = winScore(winOptScan);

  const popular = data?.popular ?? [];
  const recentlyAdded = data?.recentlyAdded ?? [];
  const libraryCount = Object.keys(library).length;

  const optimized = gameApplied > 0 || windowsApplied > 0;

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img src="/icon.png" alt="" aria-hidden className="size-12 rounded-xl object-contain shadow-glow-sm" draggable={false} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('appName')}</h1>
            <p className="text-sm text-muted-foreground">{t('home.tagline')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={optimized ? 'success' : 'warning'}>
            {optimized ? t('dashboard.optimized') : t('dashboard.needsAttention')}
          </Badge>
        </div>
      </header>

      {/* Score + primary CTA */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute inset-0 bg-crimson-hero" />
        <div className="relative flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
          <div className="flex items-center gap-5">
            <div className="flex size-24 flex-col items-center justify-center rounded-2xl border border-primary/20 bg-card shadow-sm">
              {score ? (
                <>
                  <span className="text-3xl font-bold text-primary">{score.score}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t('dashboard.score')}</span>
                </>
              ) : (
                <ScanSearch aria-hidden className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1">
              {score ? (
                <>
                  <p className="text-lg font-semibold">{t(`dashboard.scoreLabel.${score.label}`)}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">{t('dashboard.scoreHint')}</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">{t('dashboard.noHardware')}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">{t('dashboard.noHardwareHint')}</p>
                </>
              )}
            </div>
          </div>
          <Link to="/windows-optimizer">
            <Button size="lg" className="gap-2 shadow-glow-sm">
              <Zap aria-hidden className="size-4" />
              {t('dashboard.optimizeNow')}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </Button>
          </Link>
        </div>
      </section>

      {/* System overview. Only shown once there is something real to put in it —
          four em-dashes read as "detection is broken" rather than "not run". */}
      <Section title={t('dashboard.systemOverview')}>
        {hw.profile?.cpu || hw.profile?.gpuModel || hw.profile?.ramGb != null || hw.profile?.vramMb != null ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SystemTile icon={<Cpu aria-hidden className="size-5" />} label={t('hardware.cpu')} value={hw.profile?.cpu ?? '—'} />
            <SystemTile icon={<MemoryStick aria-hidden className="size-5" />} label={t('hardware.gpu')} value={hw.profile ? (gpuLabel(hw.profile) ?? '—') : '—'} />
            <SystemTile icon={<Gauge aria-hidden className="size-5" />} label={t('hardware.ram')} value={hw.profile?.ramGb != null ? `${hw.profile.ramGb} GB` : '—'} />
            <SystemTile icon={<HardDrive aria-hidden className="size-5" />} label={t('hardware.vram')} value={hw.profile?.vramMb != null ? `${hw.profile.vramMb} MB` : '—'} />
          </div>
        ) : null}
        <HardwarePanel compact />
      </Section>

      {/* Optimization status */}
      <Section title={t('dashboard.optimizationStatus')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/windows-optimizer"
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-6">
              <Wrench aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t('dashboard.windowsOptimization')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {winOptScan === null
                  ? t('dashboard.scanFirst')
                  : !winOptScan.supported
                    ? t('dashboard.windowsUnavailable')
                    : windowsApplied > 0
                      ? t('dashboard.appliedCount', { count: windowsApplied })
                      : winScoreResult
                        ? t('dashboard.windowsReady', { count: winScoreResult.score })
                        : t('dashboard.scanFirst')}
              </p>
            </div>
            <ArrowRight aria-hidden className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
          </Link>

          <Link
            to="/library"
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-6">
              <MonitorCog aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t('dashboard.gameOptimization')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {gameApplied > 0
                  ? t('dashboard.appliedCount', { count: gameApplied })
                  : libraryCount > 0
                    ? t('dashboard.gamesInLibrary', { count: libraryCount })
                    : t('dashboard.noGames')}
              </p>
            </div>
            <ArrowRight aria-hidden className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
          </Link>
        </div>
      </Section>

      {/* Recommended for you — honest */}
      <Section title={t('home.recommendedForYou')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <RecommendTile
            icon={<ScanSearch aria-hidden className="size-5" />}
            title={t('dashboard.recDetect')}
            body={t('dashboard.recDetectHint')}
            action={hw.profile ? undefined : () => void hw.detect()}
            actionLabel={hw.profile ? undefined : t('hardware.detect')}
          />
          <RecommendTile
            icon={<Wrench aria-hidden className="size-5" />}
            title={t('dashboard.recWindows')}
            body={t('dashboard.recWindowsHint')}
            to="/windows-optimizer"
            actionLabel={t('dashboard.openWindows')}
          />
          <RecommendTile
            icon={<MonitorCog aria-hidden className="size-5" />}
            title={t('dashboard.recGames')}
            body={t('dashboard.recGamesHint')}
            to="/library"
            actionLabel={t('dashboard.openGames')}
          />
        </div>
      </Section>

      {/* Popular */}
      <Section
        title={t('home.popular')}
        action={{ to: '/games', label: t('home.viewAll') }}
      >
        {isLoading && !popular.length ? (
          <GameGrid>{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}</GameGrid>
        ) : catalogError ? (
          <CatalogError message={catalogError} onRetry={() => void refetch()} />
        ) : popular.length === 0 ? (
          <EmptyState icon={<Shapes aria-hidden />} title={t('home.emptyCatalog')} />
        ) : (
          <GameGrid>
            {popular.slice(0, 10).map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </GameGrid>
        )}
      </Section>

      {/* Recently added */}
      <Section title={t('home.recentlyAdded')}>
        {isLoading && !recentlyAdded.length ? (
          <GameGrid>{Array.from({ length: 5 }, (_, i) => <CardSkeleton key={i} />)}</GameGrid>
        ) : catalogError ? (
          <CatalogError message={catalogError} onRetry={() => void refetch()} />
        ) : recentlyAdded.length === 0 ? (
          <EmptyState icon={<Shapes aria-hidden />} title={t('home.emptyCatalog')} />
        ) : (
          <GameGrid>
            {recentlyAdded.slice(0, 10).map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </GameGrid>
        )}
      </Section>
    </div>
  );
}

function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-10 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

function SystemTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function RecommendTile({
  icon,
  title,
  body,
  to,
  action,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  to?: string;
  action?: (() => void) | null;
  actionLabel?: string;
}) {
  const inner = (
    <div className="flex h-full flex-col items-start gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-5">{icon}</div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {action && actionLabel && (
        <button type="button" onClick={action} className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
          {actionLabel}
          <ArrowRight aria-hidden className="size-3 rtl:rotate-180" />
        </button>
      )}
    </div>
  );
  return to ? <Link to={to} className="h-full">{inner}</Link> : inner;
}
