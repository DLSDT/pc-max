import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { packageCompatibility, rankPackages } from '@/lib/compatibility';
import type { HardwareProfileInput } from '@goh/types';
import { ArrowLeft, Calendar, CheckCircle2, Cpu, Gamepad2, Heart, Loader2, MonitorCog, Package, RefreshCw, Server, Sparkles, Target, Zap } from 'lucide-react';
import { getGamePath, setGamePath } from '@/lib/gamePaths';
import { optimizeGame, type OptimizeProgress, type OptimizeStep } from '@/lib/optimizer';
import { useGameDetail, useOptimizations } from '@/hooks/useLibrary';
import { useIsFavorite } from '@/hooks/useFavorites';
import { api } from '@/lib/api';
import { cache } from '@/lib/cache';
import { useHardware } from '@/store/hardware';
import { Badge, Button, EmptyState, Input, Skeleton } from '@/components/ui';
import { CARD_TECHS, HARDWARE_TIER_LABEL, TECH_LABELS, formatDate } from '@/lib/labels';
import { gameIconUrl } from '@/lib/gameIcons';
import type { GameRequirement, HardwareRecommendResponse, OptimizationProfile, OptimizationSetting, PackagePublic } from '@goh/types';
import { toggleFavorite } from '@/lib/favorites';
import { cn } from '@/lib/utils';

function SettingValue({ setting }: { setting: OptimizationSetting }) {
  const match = setting.options.find((o) => o.value === setting.value);
  return <span className="font-medium text-foreground">{match?.label ?? setting.value}</span>;
}

function SettingsTable({ profile }: { profile: OptimizationProfile }) {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    const map = new Map<string, OptimizationSetting[]>();
    for (const s of profile.settings) {
      const key = s.category?.name ?? 'General';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries());
  }, [profile.settings]);

  return (
    <div className="space-y-6">
      {groups.map(([category, settings]) => (
        <div key={category}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{category}</h4>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    {t('detail.setting')}
                  </th>
                  <th scope="col" className="w-1/2 px-4 py-2.5 font-medium">
                    {t('detail.recommendedValue')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {settings.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2.5 text-muted-foreground">{s.name}</td>
                    <td className="px-4 py-2.5">
                      <SettingValue setting={s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendedForYourPc({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const hardware = useHardware((s) => s.profile);
  const [rec, setRec] = useState<HardwareRecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hardware) return;
    let cancelled = false;
    setLoading(true);
    api
      .recommend(slug, hardware)
      .then((r) => !cancelled && setRec(r))
      .catch(() => !cancelled && setRec(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug, hardware]);

  if (!hardware) return null;

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Zap aria-hidden className="size-5 text-primary" />
        {t('hardware.recommendedFor')}
      </h2>
      {loading && !rec ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : rec?.recommended ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="default">{t('hardware.bestMatch')}</Badge>
            <span className="font-semibold">{rec.recommended.name}</span>
            <Badge variant="secondary">v{rec.recommended.version}</Badge>
            {rec.recommended.targetResolution && <Badge variant="secondary">{rec.recommended.targetResolution}</Badge>}
            {rec.recommended.targetFps && <Badge variant="secondary">{t('games.fps', { fps: rec.recommended.targetFps })}</Badge>}
            <Badge variant="secondary">{rec.recommended.gpuVendor}</Badge>
          </div>
          {rec.recommended.description && <p className="mt-2 text-sm text-muted-foreground">{rec.recommended.description}</p>}
          {rec.reasons.length > 0 && (
            <ul className="mt-3 space-y-1">
              {rec.reasons.map((r) => (
                <li key={r} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-6 text-sm text-muted-foreground">
          {t('hardware.noMatch')}
        </p>
      )}
    </section>
  );
}

const STEP_LABELS: OptimizeStep[] = ['manifest', 'download', 'verify', 'backup', 'apply'];

function PackageCard({
  p,
  slug,
  gameName,
  hw,
}: {
  p: PackagePublic;
  slug: string;
  gameName: string;
  hw: HardwareProfileInput | null;
}) {
  const compat = packageCompatibility(p, hw);
  const { t } = useTranslation();
  const [gameDir, setGameDir] = useState<string>(() => getGamePath(slug) ?? '');
  const [askingPath, setAskingPath] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<OptimizeProgress | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!gameDir.trim()) {
      setAskingPath(true);
      setError(null);
      return;
    }
    setAskingPath(false);
    setRunning(true);
    setError(null);
    try {
      const res = await optimizeGame({
        gameSlug: slug,
        gameName,
        packageSlug: p.slug,
        gameDir: gameDir.trim(),
        onProgress: setProgress,
      });
      setDone(res.package.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('packages.optimizeError'));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const stepIndex = progress ? STEP_LABELS.indexOf(progress.step) : -1;
  const pct = Math.round((progress?.overall ?? 0) * 100);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{p.name}</span>
        <Badge variant="secondary">v{p.version}</Badge>
        {p.isDefault && <Badge variant="success">{t('subscription.currentPlan')}</Badge>}
        {compat.result === 'compatible' && (
          <Badge variant="success" title={compat.matched.join(', ')}>
            ✓ {t('packages.compatible')}
          </Badge>
        )}
        {compat.result === 'incompatible' && (
          <Badge variant="destructive" title={compat.reason ?? undefined}>
            ✗ {compat.reason}
          </Badge>
        )}
        {compat.result === 'unknown' && <Badge variant="outline">?</Badge>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <Badge variant="outline">{p.gpuVendor}</Badge>
        {p.gpuFamily && <Badge variant="outline">{p.gpuFamily}</Badge>}
        {p.minVramMb != null && <Badge variant="outline">VRAM ≥ {p.minVramMb} MB</Badge>}
        {p.minRamGb != null && <Badge variant="outline">RAM ≥ {p.minRamGb} GB</Badge>}
        {p.minWindows && <Badge variant="outline">Win ≥ {p.minWindows}</Badge>}
        {p.arch !== 'any' && <Badge variant="outline">{p.arch}</Badge>}
        {p.targetResolution && <Badge variant="outline">{p.targetResolution}</Badge>}
        {p.targetFps != null && <Badge variant="outline">{t('games.fps', { fps: p.targetFps })}</Badge>}
      </div>
      {p.description && <p className="mt-2 text-xs text-muted-foreground">{p.description}</p>}

      {/* Install path prompt */}
      {askingPath && (
        <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">{t('optimize.pathHint')}</p>
          <div className="flex gap-2">
            <Input
              value={gameDir}
              onChange={(e) => setGameDir(e.target.value)}
              placeholder={t('optimize.pathPlaceholder')}
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setGamePath(slug, gameDir);
                  void run();
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                setGamePath(slug, gameDir);
                void run();
              }}
            >
              {t('optimize.saveAndRun')}
            </Button>
          </div>
        </div>
      )}

      {/* Pipeline progress */}
      {running && progress && (
        <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-background/40 p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-primary">{t(`optimize.step.${progress.step}`)}</span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          {stepIndex >= 0 && (
            <ol className="flex gap-1 pt-0.5 text-[10px] text-muted-foreground">
              {STEP_LABELS.map((s, i) => (
                <li
                  key={s}
                  className={cn(
                    'rounded px-1.5 py-0.5',
                    i < stepIndex && 'bg-emerald-500/10 text-emerald-400',
                    i === stepIndex && 'bg-primary/15 text-primary',
                  )}
                >
                  {t(`optimize.step.${s}`)}
                </li>
              ))}
            </ol>
          )}
          {progress.label && <p className="truncate text-[10px] text-muted-foreground">{progress.label}</p>}
        </div>
      )}

      {error && (
        <div className="mt-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void run()} disabled={running}>
            <RefreshCw aria-hidden className="size-3.5" />
            {t('optimize.retry')}
          </Button>
        </div>
      )}

      <div className="mt-3">
        <Button size="sm" onClick={() => void run()} disabled={running || Boolean(done)}>
          {running ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          ) : done ? (
            <CheckCircle2 aria-hidden className="size-3.5" />
          ) : (
            <Zap aria-hidden className="size-3.5" />
          )}
          {done ? `${t('optimize.applied')} v${done}` : t('optimize.optimize')}
        </Button>
        {gameDir && !askingPath && !done && (
          <span className="ml-2 text-[10px] text-muted-foreground">{gameDir}</span>
        )}
      </div>
    </div>
  );
}

function PackageGroup({ title, packages, slug, gameName, hw }: { title: string; packages: PackagePublic[]; slug: string; gameName: string; hw: HardwareProfileInput | null }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {rankPackages(packages, hw).map((p) => (
          <PackageCard key={p.id} p={p} slug={slug} gameName={gameName} hw={hw} />
        ))}
      </div>
    </div>
  );
}

/** Frame Generation components (upscalers/frame-gen) are shown separately
 * from generic graphics-config packages — same install/backup/rollback
 * pipeline, just visually grouped by product area. */
function PackagesSection({ slug, gameName }: { slug: string; gameName: string }) {
  const { t } = useTranslation();
  const hw = useHardware((s) => s.profile);
  const [packages, setPackages] = useState<PackagePublic[] | null>(null);

  useEffect(() => {
    api
      .gamePackages(slug)
      .then((r) => setPackages(r.data))
      .catch(() => setPackages([]));
  }, [slug]);

  // Grouped by kind so Frame Generation / Upscaler drops are visually distinct
  // from plain graphics packages. `graphics` is the catch-all so an unknown
  // future kind still renders instead of silently disappearing.
  const frameGen = packages?.filter((p) => p.kind === 'frame_generation') ?? [];
  const upscaler = packages?.filter((p) => p.kind === 'upscaler') ?? [];
  const graphics = packages?.filter((p) => p.kind !== 'frame_generation' && p.kind !== 'upscaler') ?? [];
  const grouped = frameGen.length + upscaler.length > 0;

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Package aria-hidden className="size-5 text-primary" />
        {t('packages.title')}
      </h2>
      {packages === null ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : packages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-6 text-sm text-muted-foreground">
          {t('packages.none')}
        </p>
      ) : (
        <div className="space-y-6">
          {frameGen.length > 0 && <PackageGroup title={t('packages.frameGeneration')} packages={frameGen} slug={slug} gameName={gameName} hw={hw} />}
          {upscaler.length > 0 && <PackageGroup title={t('packages.upscaler')} packages={upscaler} slug={slug} gameName={gameName} hw={hw} />}
          {graphics.length > 0 && (
            <PackageGroup title={grouped ? t('packages.graphics') : t('packages.title')} packages={graphics} slug={slug} gameName={gameName} hw={hw} />
          )}
        </div>
      )}
    </section>
  );
}

function Requirements({ items }: { items: GameRequirement[] }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((r) => (
        <div key={r.tier} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Cpu aria-hidden className="size-4 text-primary" />
            {r.tier === 'minimum' ? t('detail.minimum') : t('detail.recommended')}
          </h4>
          <dl className="space-y-1.5 text-sm">
            {[
              ['OS', r.os],
              ['CPU', r.cpu],
              ['GPU', r.gpu],
              ['RAM', `${r.ramGb} GB`],
              ['Storage', `${r.storageGb} GB`],
              ['DirectX', r.directx],
            ].map(([k, v]) =>
              v ? (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="text-right text-foreground">{v}</dd>
                </div>
              ) : null,
            )}
          </dl>
          {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
        </div>
      ))}
    </div>
  );
}

export default function GameDetailPage() {
  const { t } = useTranslation();
  const { slug = '' } = useParams();
  const { data: game, isLoading, isError } = useGameDetail(slug);
  const { data: profiles = [] } = useOptimizations(slug);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const selected: OptimizationProfile | undefined =
    profiles.find((p) => p.slug === selectedSlug) ?? profiles.find((p) => p.isDefault) ?? profiles[0];
  const isFavorite = useIsFavorite(game?.id ?? '');

  // Record a view + remember as recent (best-effort, once per load).
  useEffect(() => {
    if (!game) return;
    cache.addRecent(game);
    void api.recordView(cache.getDeviceId(), game.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  // Hero art comes from the game's own bundled icon (per-slug artwork from the
  // brand pack). No shared/hardcoded banners — fall back to the game's own
  // cover from the catalogue, then to a neutral gradient tile.
  const heroImage = gameIconUrl(slug) ?? game?.coverUrl ?? null;
  const techs = CARD_TECHS.filter((flag) => game?.technologies[flag]);
  // Games auto-created from Optimized Setting imports have no curated genres
  // and a placeholder performanceRating (50) — hide that fabricated number
  // rather than presenting it as a real rating.
  const hasCuratedMeta = (game?.genres.length ?? 0) > 0;

  if (isLoading && !game) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (isError && !game) {
    return (
      <EmptyState
        icon={<Gamepad2 aria-hidden />}
        title={t('detail.notFound')}
        action={
          <Link
            to="/games"
            className="inline-flex h-8 items-center rounded-md border border-border bg-secondary px-3 text-xs font-medium transition-colors hover:bg-secondary/80"
          >
            {t('common.back')}
          </Link>
        }
      />
    );
  }

  if (!game) return null;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        {heroImage && (
          <img src={heroImage} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-25 blur-2xl" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />

        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:p-8">
          <div className="w-40 shrink-0 overflow-hidden rounded-xl border border-border shadow-glow-sm sm:w-52">
            {heroImage ? (
              <div className="flex aspect-[3/4] size-full items-center justify-center bg-gradient-to-br from-secondary via-card to-primary/15 p-6">
                <img
                  src={heroImage}
                  alt={`${game.name} artwork`}
                  className="max-h-full w-auto object-contain"
                />
              </div>
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center bg-gradient-to-br from-secondary to-primary/20">
                <Gamepad2 aria-hidden className="size-12 text-foreground/15" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <Link
              to="/games"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft aria-hidden className="size-3.5 rtl:rotate-180" />
              {t('detail.back')}
            </Link>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{game.name}</h1>
                {hasCuratedMeta && (
                  <Badge variant="default" className="tabular-nums">
                    {t('detail.rating')}: {game.performanceRating}
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={() => void toggleFavorite(game).catch(() => undefined)}
                  aria-label={isFavorite ? t('card.unfavorite') : t('card.favorite')}
                  aria-pressed={isFavorite}
                  className={cn(
                    'inline-flex size-8 items-center justify-center rounded-full border transition-colors',
                    isFavorite
                      ? 'border-destructive/40 bg-destructive/10 text-destructive'
                      : 'border-border bg-card text-muted-foreground hover:border-destructive/40 hover:text-destructive',
                  )}
                >
                  <Heart aria-hidden className={cn('size-4', isFavorite && 'fill-current')} />
                </button>
              </div>
              {game.tagline && <p className="mt-1 text-sm text-muted-foreground">{game.tagline}</p>}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {techs.map((flag) => (
                <Badge key={flag} variant="secondary">
                  {TECH_LABELS[flag]}
                </Badge>
              ))}
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[
                { icon: Server, k: t('detail.developer'), v: game.developer },
                { icon: Server, k: t('detail.publisher'), v: game.publisher },
                { icon: Calendar, k: t('detail.releaseDate'), v: formatDate(game.releaseDate) },
                { icon: Cpu, k: t('detail.engine'), v: game.engine },
                { icon: MonitorCog, k: t('detail.api'), v: game.api },
                { icon: Gamepad2, k: t('detail.rating'), v: hasCuratedMeta ? `${game.performanceRating}/100` : null },
              ].map(
                ({ icon: Icon, k, v }) =>
                  v && (
                    <div key={k} className="flex items-center gap-2">
                      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                        <dd className="truncate font-medium">{v}</dd>
                      </div>
                    </div>
                  ),
              )}
            </dl>
          </div>
        </div>
      </section>

      {/* Description */}
      {game.description && <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{game.description}</p>}

      {/* Recommended for your PC — compatibility engine */}
      <RecommendedForYourPc slug={slug} />

      {/* Requirements */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">{t('detail.requirements')}</h2>
        <Requirements items={game.requirements} />
      </section>

      {/* Optimization packages (file-based) */}
      <PackagesSection slug={slug} gameName={game?.name ?? slug} />

      {/* Optimization profiles */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">{t('detail.optimizationProfiles')}</h2>

        {profiles.length === 0 ? (
          <EmptyState icon={<Sparkles aria-hidden />} title={t('detail.noProfiles')} />
        ) : (
          <div className="space-y-4">
            {/* Profile selector */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('detail.optimizationProfiles')}>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={selected?.id === p.id}
                  onClick={() => setSelectedSlug(p.slug)}
                  className={cn(
                    'rounded-lg border px-3.5 py-2 text-left text-sm font-medium transition-all',
                    selected?.id === p.id
                      ? 'border-primary/40 bg-primary/10 text-primary shadow-glow-sm'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {p.colorProfile && (
                      <span
                        aria-hidden
                        className={cn('size-2 rounded-full', p.colorProfile === 'yellow' ? 'bg-amber-400' : 'bg-emerald-400')}
                      />
                    )}
                    {p.name}
                  </span>
                  <span className="block text-[10px] font-normal opacity-70">
                    v{p.version} · {HARDWARE_TIER_LABEL[p.hardwareTier]}
                  </span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="space-y-4 rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">
                    <Target aria-hidden className="size-3" />
                    {t('detail.targetFps', { fps: selected.targetFps ?? '—' })}
                  </Badge>
                  <Badge variant="secondary">{HARDWARE_TIER_LABEL[selected.hardwareTier]}</Badge>
                  <Badge variant="secondary">
                    {t('settings.version', { version: selected.version })}
                  </Badge>
                  {selected.isDefault && <Badge variant="success">Default</Badge>}
                  {selected.colorProfile && (
                    <Badge variant={selected.colorProfile === 'yellow' ? 'warning' : 'success'}>
                      {selected.colorProfile === 'yellow' ? t('detail.colorYellow') : t('detail.colorGreen')}
                    </Badge>
                  )}
                </div>
                {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}

                <SettingsTable profile={selected} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
