import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Calendar, Cpu, Gamepad2, MonitorCog, Server, Sparkles, Target } from 'lucide-react';
import { useGameDetail, useOptimizations } from '@/hooks/useLibrary';
import { api } from '@/lib/api';
import { cache } from '@/lib/cache';
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui';
import { CARD_TECHS, HARDWARE_TIER_LABEL, TECH_LABELS, formatDate } from '@/lib/labels';
import type { GameRequirement, OptimizationProfile, OptimizationSetting } from '@goh/types';
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

  // Record a view + remember as recent (best-effort, once per load).
  useEffect(() => {
    if (!game) return;
    cache.addRecent(game);
    void api.recordView(cache.getDeviceId(), game.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  const background = game?.images.find((i) => i.type === 'background')?.url;
  const techs = CARD_TECHS.filter((flag) => game?.technologies[flag]);

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
        {background && (
          <img src={background} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-30 blur-2xl" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />

        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:p-8">
          <div className="w-40 shrink-0 overflow-hidden rounded-xl border border-border shadow-glow-sm sm:w-52">
            {game.coverUrl ? (
              <img src={game.coverUrl} alt={`${game.name} cover`} className="aspect-[3/4] size-full object-cover" />
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
                <Badge variant="default" className="tabular-nums">
                  {t('detail.rating')}: {game.performanceRating}
                </Badge>
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
                { icon: Gamepad2, k: t('detail.rating'), v: `${game.performanceRating}/100` },
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

      {/* Requirements */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">{t('detail.requirements')}</h2>
        <Requirements items={game.requirements} />
      </section>

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
                  <span className="block">{p.name}</span>
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
