import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isNetworkError } from '@/lib/api';
import { cache } from '@/lib/cache';
import { runSync } from '@/lib/sync';
import { useUi } from '@/store/ui';
import type { GameDetail, GameListResponse, HomeResponse, OptimizationProfile } from '@goh/types';

const HOME_KEY = ['home'] as const;
const GAMES_KEY = ['games'] as const;

function queryKeyOf(filters: { q: string; genre: string; year: string; techs: string[] }, page: number) {
  return ['games', filters.q, filters.genre, filters.year, filters.techs.join(','), page] as const;
}

/** Home content — instant from cache, refreshed from the server. */
export function useHome() {
  return useQuery<HomeResponse>({
    queryKey: HOME_KEY,
    queryFn: () => api.home(),
    placeholderData: () => cache.getHome() ?? undefined,
    staleTime: 5 * 60 * 1000,
  });
}

/** Filtered, paginated game list — instant from cache when filters are empty. */
/**
 * Refetch catalogue data as soon as the machine is back online.
 *
 * When the API is unreachable the catalogue queries fall back to the local
 * cache and resolve *successfully*, so React Query treats that degraded result
 * as fresh for the full staleTime. This server is self-hosted and gets
 * switched off, so without this the app would keep showing stale offline data
 * for minutes after it came back. Marking the queries stale on reconnect makes
 * recovery immediate for whatever is on screen.
 */
export function useRefetchOnReconnect() {
  const qc = useQueryClient();
  useEffect(() => {
    const onOnline = () => {
      void qc.invalidateQueries({ queryKey: ['games'] });
      void qc.invalidateQueries({ queryKey: ['optimized-setting-games'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
      void qc.invalidateQueries({ queryKey: ['featured-games'] });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [qc]);
}

export function useGames(page = 1) {
  const filters = useUi((s) => s.filters);
  const key = queryKeyOf(filters, page);
  /** The cached catalogue, but only when it can honestly answer THIS query —
   *  an unfiltered first page. A filtered or paged request must not be served
   *  stale unfiltered rows. */
  const cachedForThisQuery = (): GameListResponse | undefined => {
    if (page > 1) return undefined;
    if (filters.q || filters.genre || filters.year || filters.techs.length > 0) return undefined;
    const cached = cache.getGames();
    if (!cached.length) return undefined;
    return { data: cached, meta: { page: 1, limit: cached.length, total: cached.length } } as GameListResponse;
  };

  return useQuery<GameListResponse>({
    queryKey: key,
    queryFn: async () => {
      try {
        return await api.games({
          q: filters.q || undefined,
          genre: filters.genre || undefined,
          year: filters.year || undefined,
          techs: filters.techs.length ? filters.techs.join(',') : undefined,
          page: page > 1 ? String(page) : undefined,
        });
      } catch (err) {
        // The API is self-hosted and can simply be switched off, so an
        // unreachable server must fall back to the cache rather than showing
        // an empty catalogue. placeholderData is not enough: it only renders
        // while the query is pending and vanishes the moment it errors.
        // HTTP errors still surface — those are real and worth showing.
        const fallback = isNetworkError(err) ? cachedForThisQuery() : undefined;
        if (fallback) return fallback;
        throw err;
      }
    },
    placeholderData: cachedForThisQuery,
    staleTime: 5 * 60 * 1000,
  });
}

/** Optimized Setting — every published game with a Yellow/Green profile. */
export function useOptimizedSettingGames() {
  return useQuery<GameListResponse['data']>({
    queryKey: ['optimized-setting-games'],
    queryFn: async () => {
      try {
        return (await api.optimizedSettingGames()).data;
      } catch (err) {
        // Server unreachable → derive the list from the cached catalogue so
        // the page still works offline. Every profile is cached alongside its
        // game, so this is the same set the server would return.
        if (isNetworkError(err)) {
          const offline = cache
            .getGames()
            .filter((g) => (cache.getProfiles(g.slug) ?? []).some((p) => p.colorProfile));
          if (offline.length) return offline;
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Admin-curated "featured" games.
 *
 * The endpoint defaults to a 6-wide dashboard row, so the full-page Recommended
 * grid has to ask for more explicitly or it renders one row under a page
 * heading.
 */
export function useFeatured(limit?: number) {
  return useQuery<GameListResponse['data']>({
    queryKey: ['featured-games', limit ?? 'default'],
    queryFn: async () => (await api.featured(limit)).data,
    staleTime: 5 * 60 * 1000,
  });
}

/** Game detail — cache-first, background refresh. */
export function useGameDetail(slug: string) {
  return useQuery<GameDetail>({
    queryKey: ['game', slug],
    queryFn: () => api.game(slug),
    placeholderData: () => cache.getGame(slug) ?? undefined,
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(slug),
  });
}

/** Optimization profiles for a game. */
export function useOptimizations(slug: string) {
  return useQuery<OptimizationProfile[]>({
    queryKey: ['optimizations', slug],
    queryFn: async () => (await api.optimizations(slug)).data,
    placeholderData: () => cache.getProfiles(slug) ?? undefined,
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(slug),
  });
}

/** One-shot initial sync on app boot. */
export function useInitialSync() {
  const queryClient = useQueryClient();
  const setSyncStatus = useUi((s) => s.setSyncStatus);

  return useQuery({
    queryKey: ['sync', 'initial'],
    queryFn: async () => {
      setSyncStatus('syncing');
      const result = await runSync();
      // Truthful connectivity: no internet = offline, service unreachable =
      // api-unavailable, anything else = online.
      setSyncStatus(result.offline ? 'offline' : result.apiUnavailable ? 'api-unavailable' : 'online');
      // Warm the query cache with freshly synced data.
      const home = cache.getHome();
      if (home) queryClient.setQueryData(HOME_KEY, home);
      const games = cache.getGames();
      if (games.length) {
        queryClient.setQueryData(GAMES_KEY, { data: games, meta: { page: 1, limit: 100, total: games.length } });
      }
      return result;
    },
    retry: 0,
    staleTime: Infinity,
  });
}
