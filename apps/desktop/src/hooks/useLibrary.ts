import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cache } from '@/lib/cache';
import { runSync } from '@/lib/sync';
import { useUi } from '@/store/ui';
import type { GameDetail, GameListResponse, HomeResponse, OptimizationProfile } from '@goh/types';

const HOME_KEY = ['home'] as const;
const GAMES_KEY = ['games'] as const;

function queryKeyOf(filters: { q: string; genre: string; year: string; techs: string[] }) {
  return ['games', filters.q, filters.genre, filters.year, filters.techs.join(',')] as const;
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

/** Filtered game list — instant from cache when filters are empty. */
export function useGames() {
  const filters = useUi((s) => s.filters);
  const key = queryKeyOf(filters);
  return useQuery<GameListResponse>({
    queryKey: key,
    queryFn: () =>
      api.games({
        q: filters.q || undefined,
        genre: filters.genre || undefined,
        year: filters.year || undefined,
        techs: filters.techs.length ? filters.techs.join(',') : undefined,
      }),
    placeholderData: () => {
      const cached = cache.getGames();
      if (!filters.q && !filters.genre && !filters.year && filters.techs.length === 0 && cached.length) {
        return { data: cached, meta: { page: 1, limit: 100, total: cached.length } } as GameListResponse;
      }
      return undefined;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Optimized Setting — every published game with a Yellow/Green profile. */
export function useOptimizedSettingGames() {
  return useQuery<GameListResponse['data']>({
    queryKey: ['optimized-setting-games'],
    queryFn: async () => (await api.optimizedSettingGames()).data,
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
