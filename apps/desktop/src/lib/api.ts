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

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'invalid';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    public readonly kind: ApiErrorKind = 'http',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * True when the failure was a network-level failure (API unreachable / no
 * internet) rather than an HTTP response. `status === 0` in that case.
 */
export function isNetworkError(err: unknown): err is ApiError {
  return err instanceof ApiError && (err.kind === 'network' || err.kind === 'timeout');
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Attach the in-memory user access token + refresh on 401. */
  authed?: boolean;
  /** Include cookies (needed for the httpOnly refresh cookie). */
  withCredentials?: boolean;
  /** Override the default request timeout (ms). Health probes use a short one. */
  timeoutMs?: number;
}

/** In-memory user access token — never persisted to disk. */
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

/** Combine a caller-supplied signal with the request timeout. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (signal) return signal; // the caller owns the timeout
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  ctrl.signal.addEventListener('abort', () => clearTimeout(id), { once: true });
  return ctrl.signal;
}

async function request<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.authed) {
    const token = authToken ?? (await restoreSession());
    if (token) headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method: options.method ?? 'GET',
      signal: withTimeout(options.signal, options.timeoutMs ?? config.requestTimeoutMs),
      credentials: options.authed || options.withCredentials ? 'include' : undefined,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    // fetch only throws for network-level failures and aborts — never for HTTP
    // status codes. Distinguish timeout from unreachable so the UI can show a
    // truthful message instead of a blanket "offline".
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    if (timedOut) {
      throw new ApiError('The PC MAX service took too long to respond. Please try again.', 0, null, 'timeout');
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new ApiError(
      offline
        ? 'You are offline. Reconnect to the internet and try again.'
        : 'Unable to reach the PC MAX service. Check your internet connection and try again.',
      0,
      null,
      'network',
    );
  }

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

/**
 * Probes the API health endpoint. Distinguishes:
 *  - 'online'          — the PC MAX service answered (any HTTP status)
 *  - 'offline'         — no internet connectivity (navigator.onLine)
 *  - 'api-unavailable' — internet present but the API is unreachable/timing out
 */
export async function checkServiceHealth(): Promise<'online' | 'offline' | 'api-unavailable'> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  try {
    await fetch(`${config.apiUrl}/health`, {
      signal: withTimeout(undefined, 6_000),
      headers: { accept: 'application/json' },
    });
    return 'online';
  } catch {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    return 'api-unavailable';
  }
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
