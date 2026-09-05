import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { genreName } from '@/i18n';
import { ChevronLeft, ChevronRight, CloudOff, FilterX, SearchX, WifiOff } from 'lucide-react';
import { useGames, useHome } from '@/hooks/useLibrary';
import { useUi } from '@/store/ui';
import { ApiError } from '@/lib/api';
import { Button, EmptyState, Input, Skeleton } from '@/components/ui';
import { CardSkeleton } from '@/components/CardSkeleton';
import GameCard from '@/components/GameCard';
import { GameGrid } from '@/components/Section';
import type { TechFlag } from '@goh/types';
import { cn } from '@/lib/utils';

const FILTER_TECHS: { flag: TechFlag; label: string }[] = [
  { flag: 'dlss', label: 'DLSS' },
  { flag: 'fsr', label: 'FSR' },
  { flag: 'xess', label: 'XeSS' },
  { flag: 'ray_tracing', label: 'RT' },
  { flag: 'frame_generation', label: 'FG' },
];

export default function GamesPage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const resetFilters = useUi((s) => s.resetFilters);

  const { data: home } = useHome();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useGames(page);

  const [searchInput, setSearchInput] = useState(filters.q);

  // Any filter change invalidates the current page.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.genre, filters.year, filters.techs.join(',')]);

  // Sync URL → store once on mount (deep links from the header search).
  useEffect(() => {
    setFilters({
      q: searchParams.get('q') ?? '',
      genre: searchParams.get('genre') ?? '',
      year: searchParams.get('year') ?? '',
      techs: (searchParams.get('techs') ?? '').split(',').filter(Boolean),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce the search box into the store.
  useEffect(() => {
    const id = setTimeout(() => setFilters({ q: searchInput }), 300);
    return () => clearTimeout(id);
  }, [searchInput, setFilters]);

  // Push filters → URL (replace so back/forward stays predictable).
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.q) next.set('q', filters.q);
    if (filters.genre) next.set('genre', filters.genre);
    if (filters.year) next.set('year', filters.year);
    if (filters.techs.length) next.set('techs', filters.techs.join(','));
    const current = searchParams.toString();
    if (next.toString() !== current) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const games = data?.data ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;
  const years = useMemo(
    () => Array.from(new Set(games.map((g) => g.releaseYear).filter((y): y is number => y !== null))).sort((a, b) => b - a),
    [games],
  );

  const hasFilters = Boolean(filters.q || filters.genre || filters.year || filters.techs.length);

  function toggleTech(flag: TechFlag) {
    const next = filters.techs.includes(flag) ? filters.techs.filter((f) => f !== flag) : [...filters.techs, flag];
    setFilters({ techs: next });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('games.title')}</h1>
          {data && (
            <p className="mt-1 text-xs text-muted-foreground">{t('categories.games', { count: data.meta.total })}</p>
          )}
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <FilterX aria-hidden />
            {t('games.clearFilters')}
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/50 p-3">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('games.searchPlaceholder')}
          aria-label={t('games.searchPlaceholder')}
          className="max-w-56"
        />

        <select
          value={filters.genre}
          onChange={(e) => setFilters({ genre: e.target.value })}
          aria-label={t('games.genre')}
          className="h-9 rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t('games.allGenres')}</option>
          {(home?.categories ?? []).map((c) => (
            <option key={c.slug} value={c.slug}>
              {genreName(c.slug, c.name, i18n.language)}
            </option>
          ))}
        </select>

        <select
          value={filters.year}
          onChange={(e) => setFilters({ year: e.target.value })}
          aria-label={t('games.year')}
          className="h-9 rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t('games.allYears')}</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('games.technologies')}>
          {FILTER_TECHS.map(({ flag, label }) => (
            <button
              key={flag}
              type="button"
              onClick={() => toggleTech(flag)}
              aria-pressed={filters.techs.includes(flag)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                filters.techs.includes(flag)
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-accent',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {isLoading && !games.length ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <GameGrid>{Array.from({ length: 10 }, (_, i) => <CardSkeleton key={i} />)}</GameGrid>
        </div>
      ) : isError && !games.length ? (
        <EmptyState
          icon={
            error instanceof ApiError && error.kind === 'network'
              ? typeof navigator !== 'undefined' && navigator.onLine === false
                ? <WifiOff aria-hidden />
                : <CloudOff aria-hidden />
              : <SearchX aria-hidden />
          }
          title={
            error instanceof ApiError && error.kind !== 'http'
              ? error.message
              : t('common.serviceUnavailable')
          }
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : games.length === 0 ? (
        <EmptyState icon={<SearchX aria-hidden />} title={t('games.noResults')} />
      ) : (
        <>
          <GameGrid>
            {games.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </GameGrid>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft aria-hidden className="size-4 rtl:hidden" />
                <ChevronRight aria-hidden className="hidden size-4 rtl:block" />
                {t('games.prevPage')}
              </Button>
              <span className="text-xs font-medium text-muted-foreground">
                {t('games.pageOf', { page, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t('games.nextPage')}
                <ChevronRight aria-hidden className="size-4 rtl:hidden" />
                <ChevronLeft aria-hidden className="hidden size-4 rtl:block" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
