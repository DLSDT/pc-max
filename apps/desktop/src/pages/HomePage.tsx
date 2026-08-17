import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, MonitorCog } from 'lucide-react';
import { useHome } from '@/hooks/useLibrary';
import { Badge } from '@/components/ui';
import { CardSkeleton } from '@/components/CardSkeleton';
import GameCard from '@/components/GameCard';
import { GameGrid, Section } from '@/components/Section';
import { HARDWARE_TIER_LABEL } from '@/lib/labels';

export default function HomePage() {
  const { t } = useTranslation();
  const { data, isLoading } = useHome();

  const popular = data?.popular ?? [];
  const recentlyAdded = data?.recentlyAdded ?? [];
  const hero = data?.featured[0] ?? popular[0];

  return (
    <div className="space-y-10">
      {/* Hero */}
      {isLoading && !hero ? (
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-secondary" />
      ) : hero ? (
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
          {hero.coverUrl && (
            <img
              src={hero.coverUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full scale-110 object-cover opacity-25 blur-2xl"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-transparent" />

          <div className="relative flex min-h-72 flex-col justify-end gap-4 p-8 sm:p-10">
            <Badge variant="default" className="w-fit">
              {hero.genres[0]?.name ?? 'Featured'}
            </Badge>
            <h1 className="max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">{hero.name}</h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{hero.tagline}</p>

            {hero.defaultProfile && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">
                  {t('home.heroFps', { fps: hero.defaultProfile.targetFps ?? '—' })}
                </Badge>
                <Badge variant="secondary">
                  {t('home.heroPreset', { preset: hero.defaultProfile.name })}
                </Badge>
                <Badge variant="secondary">
                  {HARDWARE_TIER_LABEL[hero.defaultProfile.hardwareTier ?? 'mid_range']}
                </Badge>
              </div>
            )}

            <div className="mt-2 flex gap-3">
              <Link
                to={`/games/${hero.slug}`}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-glow-sm transition-colors hover:bg-primary/90"
              >
                {t('home.viewOptimization')}
                <ArrowRight aria-hidden className="rtl:rotate-180" />
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* Popular */}
      <Section
        title={t('home.popular')}
        action={{ to: '/games', label: t('home.viewAll') }}
      >
        {isLoading && !popular.length ? (
          <GameGrid>{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}</GameGrid>
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
        ) : (
          <GameGrid>
            {recentlyAdded.slice(0, 10).map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </GameGrid>
        )}
      </Section>

      {/* Recommended for your PC — modular placeholder until hardware detection ships */}
      <Section title={t('home.recommendedForYou')}>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-6">
            <MonitorCog aria-hidden />
          </div>
          <p className="max-w-md text-sm text-muted-foreground">{t('home.recommendedPlaceholder')}</p>
          <Link
            to="/games"
            className="inline-flex h-8 items-center rounded-md border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            {t('games.title')}
          </Link>
        </div>
      </Section>
    </div>
  );
}
