import { config } from './config';
import type {
  AppVersionCheckResponse,
  DevicePublic,
  GameDetail,
  GameListResponse,
  GameSummary,
  HardwareProfileInput,
  HardwareRecommendResponse,
  HomeResponse,
  MySubscription,
  OptimizationProfile,
  OtpSendResponse,
  PackageDownloadResponse,
  PackageListResponse,
  ProfileListResponse,
  PurchaseResponse,
  SubscriptionPlanPublic,
  SyncResponse,
  UserAuthResponse,
  UserPublic,
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
  /** Attach the in-memory user access token + refresh on 401. */
  authed?: boolean;
  /** Include cookies (needed for the httpOnly refresh cookie). */
  withCredentials?: boolean;
}

/** In-memory user access token — never persisted to disk. */
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.authed) {
    const token = authToken ?? (await restoreSession());
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${config.apiUrl}${path}`, {
    method: options.method ?? 'GET',
    signal: options.signal,
    credentials: options.authed || options.withCredentials ? 'include' : undefined,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && options.authed && !retried) {
    // Access token expired — refresh via the httpOnly cookie and retry once.
    if (await refreshSession()) return request<T>(path, options, true);
    throw new ApiError('Session expired — please sign in again', 401, null);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status, body);
  }
  return (await res.json()) as T;
}

/** Try to restore the session via the httpOnly refresh cookie. */
async function restoreSession(): Promise<string | null> {
  try {
    const res = await fetch(`${config.apiUrl}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as UserAuthResponse;
    setAuthToken(data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

/** Refresh the access token using the httpOnly cookie. Returns true on success. */
async function refreshSession(): Promise<boolean> {
  return (await restoreSession()) !== null;
}

export const api = {
  home: (signal?: AbortSignal) => request<HomeResponse>('/home/cached', { signal }),
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

  // ------------------------------------------------------------ account
  sendOtp: (identifier: string, purpose: 'register' | 'reset') =>
    request<OtpSendResponse>('/auth/otp/send', { method: 'POST', body: { identifier, purpose }, authed: false }),
  register: (body: { identifier: string; username?: string; password: string; otp: string }) =>
    request<UserAuthResponse>('/auth/register', { method: 'POST', body, authed: false, withCredentials: true }),
  login: (body: { identifier: string; password: string }) =>
    request<UserAuthResponse>('/auth/login', { method: 'POST', body, authed: false, withCredentials: true }),
  forgotPassword: (identifier: string) =>
    request<OtpSendResponse>('/auth/password/forgot', { method: 'POST', body: { identifier }, authed: false }),
  resetPassword: (body: { identifier: string; otp: string; newPassword: string }) =>
    request<{ ok: boolean }>('/auth/password/reset', { method: 'POST', body, authed: false }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', authed: true, withCredentials: true }),
  me: () => request<UserPublic>('/auth/me', { authed: true }),
  updateMe: (body: { username?: string }) => request<UserPublic>('/me', { method: 'PATCH', body, authed: true }),
  getFavorites: () => request<GameListResponse>('/favorites', { authed: true }),
  addFavorite: (gameId: string) =>
    request<{ ok: boolean; favorited: boolean }>(`/favorites/${gameId}`, { method: 'PUT', authed: true }),
  removeFavorite: (gameId: string) =>
    request<{ ok: boolean; favorited: boolean }>(`/favorites/${gameId}`, { method: 'DELETE', authed: true }),
  mySubscription: () => request<MySubscription>('/me/subscription', { authed: true }),
  myDevices: () => request<{ data: DevicePublic[] }>('/me/devices', { authed: true }),
  registerDeviceAuthed: (body: { deviceId: string; name?: string; platform: 'windows' }) =>
    request<DevicePublic>('/me/devices', { method: 'POST', body, authed: true }),
  revokeDevice: (id: string) => request<{ ok: boolean }>(`/me/devices/${id}`, { method: 'DELETE', authed: true }),

  // ------------------------------------------------------------ storefront
  plans: () => request<{ data: SubscriptionPlanPublic[] }>('/subscriptions/plans'),
  purchase: (body: { planId: string; idempotencyKey: string }) =>
    request<PurchaseResponse>('/subscriptions/purchase', { method: 'POST', body, authed: true }),
  /** Provider callback — for the mock provider this completes the payment. */
  completePayment: (provider: string, paymentId: string) =>
    request<{ ok: boolean }>(`/payments/${provider}/callback`, { method: 'POST', body: { paymentId } }),

  // ------------------------------------------------------------ hardware
  saveHardware: (profile: HardwareProfileInput) =>
    request<HardwareProfileInput>('/me/hardware', { method: 'PUT', body: profile, authed: true }),
  recommend: (gameSlug: string, hardware: HardwareProfileInput) =>
    request<HardwareRecommendResponse>('/hardware/recommend', { method: 'POST', body: { gameSlug, hardware } }),

  // ------------------------------------------------------------ packages
  gamePackages: (slug: string) => request<PackageListResponse>(`/games/${slug}/packages`),
  /** Entitlement-gated download — returns the manifest with short-lived signed URLs. */
  downloadPackage: (gameSlug: string, packageSlug: string) =>
    request<PackageDownloadResponse>(`/games/${gameSlug}/packages/${packageSlug}/download`, {
      method: 'POST',
      body: {},
      authed: true,
    }),
  remoteConfig: () => request<{ data: Record<string, unknown> }>('/config'),
};
