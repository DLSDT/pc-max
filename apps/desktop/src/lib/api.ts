import { config } from './config';
import type {
  AppVersionCheckResponse,
  GameDetail,
  GameListResponse,
  GameSummary,
  HomeResponse,
  OptimizationProfile,
  ProfileListResponse,
  SyncResponse,
} from '@goh/types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method: options.method ?? 'GET',
    signal: options.signal,
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status, body);
  }
  return (await res.json()) as T;
}

export const api = {
  home: (signal?: AbortSignal) => request<HomeResponse>('/home', { signal }),
  games: (params: Record<string, string | undefined>, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    const query = qs.toString();
    return request<GameListResponse>(`/games${query ? `?${query}` : ''}`, { signal });
  },
  game: (slug: string, signal?: AbortSignal) => request<GameDetail>(`/games/${slug}`, { signal }),
  optimizations: (slug: string, signal?: AbortSignal) =>
    request<ProfileListResponse>(`/games/${slug}/optimizations`, { signal }),
  profile: (slug: string, profileSlug: string, signal?: AbortSignal) =>
    request<OptimizationProfile>(`/games/${slug}/optimizations/${profileSlug}`, { signal }),
  featured: (signal?: AbortSignal) => request<{ data: GameSummary[] }>('/featured', { signal }),
  sync: (since: string | null, signal?: AbortSignal) =>
    request<SyncResponse>(`/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`, { signal }),
  appVersion: (current: string) =>
    request<AppVersionCheckResponse>(`/app/version?current=${encodeURIComponent(current)}&platform=windows`),
  registerDevice: (deviceId: string, appVersion: string) =>
    request<{ userId: string; deviceId: string; createdAt: string }>('/users/device', {
      method: 'POST',
      body: { deviceId, platform: 'windows', appVersion },
    }),
  recordView: (deviceId: string | null, gameId?: string, profileId?: string) =>
    request<{ ok: boolean }>('/views', {
      method: 'POST',
      body: { deviceId: deviceId ?? undefined, gameId, profileId },
    }).catch(() => ({ ok: false })),
};
