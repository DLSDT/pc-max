import { config } from './config';
import type {
  AdminMe,
  AppVersionCheckResponse,
  AuthResponse,
  DevicePublic,
  GameDetail,
  GameListResponse,
  GameSummary,
  HardwareProfileInput,
  HardwareRecommendResponse,
  HomeResponse,
  MfgTool,
  MfgToolPackageResponse,
  MfgToolStatusResponse,
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

/** Loose row shape for admin endpoints — the admin tabs consume these as untyped records. */
type Row = Record<string, unknown>;

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
  /** Attach the in-memory ADMIN access token + refresh on 401 (separate session from `authed`). */
  authedAdmin?: boolean;
  /** Include cookies (needed for the httpOnly refresh cookie). */
  withCredentials?: boolean;
  /** Override the default request timeout (ms). Health probes use a short one. */
  timeoutMs?: number;
}

/** In-memory user access token — never persisted to disk. */
/**
 * Called when the server has definitively rejected the session — the access
 * token is gone AND the refresh cookie could not renew it.
 *
 * Without this the UI stayed in its signed-in state while every request came
 * back 401: the user sees their account, their library and their subscription,
 * and nothing works. The auth store registers a handler that clears the session
 * so the app reacts once instead of failing repeatedly.
 *
 * Lives here rather than importing the store, which would make api.ts depend on
 * something that depends on it.
 */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null) {
  onSessionExpired = fn;
}

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

/**
 * In-memory ADMIN access token — a separate credential from the user token
 * above. The API's admin routes (/admin/*) are authenticated against the
 * `admins` table via a dedicated /admin/auth/login, entirely independent of
 * the end-user auth flow (see apps/api/src/modules/auth.ts vs auth-user.ts).
 */
let adminAuthToken: string | null = null;
export function setAdminAuthToken(token: string | null) {
  adminAuthToken = token;
}
export function getAdminAuthToken(): string | null {
  return adminAuthToken;
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
  if (options.authedAdmin) {
    const token = adminAuthToken ?? (await restoreAdminSession());
    if (token) headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method: options.method ?? 'GET',
      signal: withTimeout(options.signal, options.timeoutMs ?? config.requestTimeoutMs),
      credentials: options.authed || options.authedAdmin || options.withCredentials ? 'include' : undefined,
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

  if (res.status === 401 && (options.authed || options.authedAdmin) && !retried) {
    // Access token expired — refresh via the httpOnly cookie and retry once.
    const refreshed = options.authedAdmin ? await refreshAdminSession() : await refreshSession();
    if (refreshed) return request<T>(path, options, true);
    // Only the end-user session has a store to clear; the admin panel handles
    // its own re-login.
    if (options.authed) onSessionExpired?.();
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

/** Try to restore the ADMIN session via its own httpOnly refresh cookie (`goh_refresh`). */
async function restoreAdminSession(): Promise<string | null> {
  try {
    const res = await fetch(`${config.apiUrl}/admin/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as AuthResponse;
    setAdminAuthToken(data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

/** Refresh the admin access token using the httpOnly cookie. Returns true on success. */
async function refreshAdminSession(): Promise<boolean> {
  return (await restoreAdminSession()) !== null;
}

/** Build a query string from a flat params object, skipping empty values. */
function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const query = qs.toString();
  return query ? `?${query}` : '';
}

/** Admin list endpoints return `{ data, meta: { total } }` — flatten to `{ data, total }` for the admin tabs. */
async function adminList<T>(path: string): Promise<{ data: T[]; total: number }> {
  const res = await request<{ data: T[]; meta?: { total: number } }>(path, { authedAdmin: true });
  return { data: res.data, total: res.meta?.total ?? res.data.length };
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
  featured: (limit?: number, signal?: AbortSignal) =>
    request<{ data: GameSummary[] }>(`/featured${limit ? `?limit=${limit}` : ''}`, { signal }),
  optimizedSettingGames: (signal?: AbortSignal) => request<{ data: GameSummary[] }>('/optimized-setting/games', { signal }),
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
  /** Which gated areas the signed-in user may use (server-decided). */
  myFeatures: () => request<{ features: Record<string, boolean> }>('/me/features', { authed: true }),
  /** Server go-ahead for a gated feature. Throws 403 without a subscription. */
  authorizeFeature: (feature: string) =>
    request<{ ok: boolean; feature: string }>(`/me/features/${feature}/authorize`, { method: 'POST', authed: true }),
  /** Is an OptiFlow/OptiScaler package published? Public on purpose — "nothing
   *  uploaded yet" must not be shown to the user as a subscription problem. */
  mfgToolStatus: (tool: MfgTool) => request<MfgToolStatusResponse>(`/mfg/tools/${tool}`),
  /** Entitlement-gated manifest with signed per-file URLs. */
  mfgToolDownload: (
    tool: MfgTool,
    sel?: string | null | { installer?: string | null; plan?: string | null; order?: string | null },
  ) => {
    const q = new URLSearchParams();
    if (typeof sel === 'string') q.set('variant', sel);
    else if (sel) {
      // Only send what was chosen; an absent group means the package has none.
      if (sel.installer) q.set('installer', sel.installer);
      if (sel.plan) q.set('plan', sel.plan);
      if (sel.order) q.set('order', sel.order);
    }
    const qs = q.toString();
    return request<MfgToolPackageResponse>(`/mfg/tools/${tool}/download${qs ? `?${qs}` : ''}`, {
      method: 'POST',
      authed: true,
    });
  },
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
  gamePackages: (slug: string, kind?: 'graphics' | 'frame_generation') =>
    request<PackageListResponse>(`/games/${slug}/packages${kind ? `?kind=${kind}` : ''}`),
  /** Entitlement-gated download — returns the manifest with short-lived signed URLs. */
  downloadPackage: (gameSlug: string, packageSlug: string) =>
    request<PackageDownloadResponse>(`/games/${gameSlug}/packages/${packageSlug}/download`, {
      method: 'POST',
      body: {},
      authed: true,
    }),
  remoteConfig: () => request<{ data: Record<string, unknown> }>('/config'),

  // ------------------------------------------------------------ admin auth
  // Entirely separate credential from the end-user session above — backed by
  // the `admins` table, not `users` (see apps/api/src/modules/auth.ts).
  adminLogin: (body: { email: string; password: string }) =>
    request<AuthResponse>('/admin/auth/login', { method: 'POST', body, withCredentials: true }),
  adminLogout: () => request<{ ok: boolean }>('/admin/auth/logout', { method: 'POST', withCredentials: true }),
  adminMe: () => request<AdminMe>('/admin/auth/me', { authedAdmin: true }),

  // ------------------------------------------------------------ admin dashboard
  adminDashboard: () => request<Record<string, unknown>>('/admin/dashboard', { authedAdmin: true }),

  // ------------------------------------------------------------ admin games
  adminGames: (params?: { q?: string; page?: string; limit?: string }) =>
    adminList<Row>(`/admin/games${buildQuery(params ?? {})}`),
  adminGetGame: (id: string) => request<Row>(`/admin/games/${id}`, { authedAdmin: true }),
  adminCreateGame: (input: Record<string, unknown>) =>
    request<Row>('/admin/games', { method: 'POST', body: input, authedAdmin: true }),
  adminUpdateGame: (id: string, patch: Record<string, unknown>) =>
    request<Row>(`/admin/games/${id}`, { method: 'PATCH', body: patch, authedAdmin: true }),
  adminDeleteGame: (id: string) => request<{ ok: boolean }>(`/admin/games/${id}`, { method: 'DELETE', authedAdmin: true }),
  adminPublishGame: (id: string, status: string) =>
    request<{ ok: boolean }>(`/admin/games/${id}/publish`, { method: 'POST', body: { status }, authedAdmin: true }),
  adminAddGameImage: (gameId: string, input: { type: string; objectKey: string }) =>
    request<Row>(`/admin/games/${gameId}/images`, { method: 'POST', body: input, authedAdmin: true }),
  adminDeleteGameImage: (gameId: string, imageId: string) =>
    request<{ ok: boolean }>(`/admin/games/${gameId}/images/${imageId}`, { method: 'DELETE', authedAdmin: true }),
  adminSetGameRequirements: (gameId: string, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/admin/games/${gameId}/requirements`, { method: 'PUT', body, authedAdmin: true }),

  // ------------------------------------------------------------ admin uploads
  adminPresignUpload: (kind: string, contentType: string, size: number) =>
    request<{ uploadUrl: string; objectKey: string; publicUrl: string }>('/admin/uploads/presign', {
      method: 'POST',
      body: { kind, contentType, size },
      authedAdmin: true,
    }),
  /** Raw PUT of the file bytes to the presigned URL — not an API-prefixed call. */
  adminUploadFile: async (uploadUrl: string, file: File) => {
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    if (!res.ok) throw new ApiError(`Upload failed (${res.status})`, res.status, null);
  },

  // ------------------------------------------------------------ admin optimization profiles
  adminGameProfiles: (gameId: string) => request<{ data: Row[] }>(`/admin/games/${gameId}/profiles`, { authedAdmin: true }),
  adminCreateProfile: (gameId: string, input: Record<string, unknown>) =>
    request<Row>(`/admin/games/${gameId}/profiles`, { method: 'POST', body: input, authedAdmin: true }),
  adminGetProfile: (id: string) => request<Row>(`/admin/profiles/${id}`, { authedAdmin: true }),
  adminDeleteProfile: (id: string) => request<{ ok: boolean }>(`/admin/profiles/${id}`, { method: 'DELETE', authedAdmin: true }),
  adminPublishProfile: (id: string, status: string) =>
    request<{ ok: boolean }>(`/admin/profiles/${id}/publish`, { method: 'POST', body: { status }, authedAdmin: true }),
  adminReleaseProfileVersion: (id: string, changeNote?: string) =>
    request<{ ok: boolean; version: string }>(`/admin/profiles/${id}/versions`, {
      method: 'POST',
      body: { changeNote },
      authedAdmin: true,
    }),
  adminAddSetting: (profileId: string, input: Record<string, unknown>) =>
    request<{ id: string }>(`/admin/profiles/${profileId}/settings`, { method: 'POST', body: input, authedAdmin: true }),
  adminDeleteSetting: (settingId: string) =>
    request<{ ok: boolean }>(`/admin/settings/${settingId}`, { method: 'DELETE', authedAdmin: true }),
  adminAddOption: (settingId: string, input: Record<string, unknown>) =>
    request<{ id: string }>(`/admin/settings/${settingId}/options`, { method: 'POST', body: input, authedAdmin: true }),
  adminDeleteOption: (optionId: string) =>
    request<{ ok: boolean }>(`/admin/options/${optionId}`, { method: 'DELETE', authedAdmin: true }),

  // ------------------------------------------------------------ admin packages
  adminPackages: (params?: { gameId?: string; status?: string; kind?: string; page?: string; limit?: string }) =>
    adminList<Row>(`/admin/packages${buildQuery(params ?? {})}`),
  adminGetPackage: (id: string) => request<Row>(`/admin/packages/${id}`, { authedAdmin: true }),
  adminCreatePackage: (input: Record<string, unknown>) =>
    request<Row>('/admin/packages', { method: 'POST', body: input, authedAdmin: true }),
  adminUpdatePackage: (id: string, patch: Record<string, unknown>) =>
    request<Row>(`/admin/packages/${id}`, { method: 'PATCH', body: patch, authedAdmin: true }),
  adminPublishPackage: (id: string) =>
    request<Row>(`/admin/packages/${id}/publish`, { method: 'POST', body: {}, authedAdmin: true }),
  adminArchivePackage: (id: string) => request<Row>(`/admin/packages/${id}/archive`, { method: 'POST', authedAdmin: true }),
  adminDeletePackage: (id: string) => request<{ ok: boolean }>(`/admin/packages/${id}`, { method: 'DELETE', authedAdmin: true }),
  adminPackageFiles: (id: string) => request<{ data: Row[] }>(`/admin/packages/${id}/files`, { authedAdmin: true }),
  adminPresignPackageUpload: (id: string, filename: string, size: number) =>
    request<{ uploadUrl: string; objectKey: string; publicUrl: string }>(`/admin/packages/${id}/files/presign`, {
      method: 'POST',
      body: { filename, size },
      authedAdmin: true,
    }),
  /** Raw PUT of the file bytes to the presigned URL — not an API-prefixed call. */
  adminUploadPackageFile: async (uploadUrl: string, file: File) => {
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
    if (!res.ok) throw new ApiError(`Upload failed (${res.status})`, res.status, null);
  },
  adminCompletePackageFile: (id: string, input: Record<string, unknown>) =>
    request<Row>(`/admin/packages/${id}/files/complete`, { method: 'POST', body: input, authedAdmin: true }),
  adminDeletePackageFile: (id: string, fileId: string) =>
    request<{ ok: boolean }>(`/admin/packages/${id}/files/${fileId}`, { method: 'DELETE', authedAdmin: true }),

  // ------------------------------------------------------------ admin taxonomy
  adminCategories: () => request<{ data: Row[] }>('/admin/categories', { authedAdmin: true }),
  adminCreateCategory: (input: Record<string, unknown>) =>
    request<Row>('/admin/categories', { method: 'POST', body: input, authedAdmin: true }),
  adminUpdateCategory: (id: string, patch: Record<string, unknown>) =>
    request<Row>(`/admin/categories/${id}`, { method: 'PATCH', body: patch, authedAdmin: true }),
  adminDeleteCategory: (id: string) => request<{ ok: boolean }>(`/admin/categories/${id}`, { method: 'DELETE', authedAdmin: true }),
  adminTags: () => request<{ data: Row[] }>('/admin/tags', { authedAdmin: true }),
  adminCreateTag: (input: Record<string, unknown>) =>
    request<Row>('/admin/tags', { method: 'POST', body: input, authedAdmin: true }),
  adminUpdateTag: (id: string, patch: Record<string, unknown>) =>
    request<Row>(`/admin/tags/${id}`, { method: 'PATCH', body: patch, authedAdmin: true }),
  adminDeleteTag: (id: string) => request<{ ok: boolean }>(`/admin/tags/${id}`, { method: 'DELETE', authedAdmin: true }),
  adminOptimizationCategories: () => request<{ data: Row[] }>('/admin/optimization-categories', { authedAdmin: true }),
  adminCreateOptimizationCategory: (input: Record<string, unknown>) =>
    request<Row>('/admin/optimization-categories', { method: 'POST', body: input, authedAdmin: true }),
  adminUpdateOptimizationCategory: (id: string, patch: Record<string, unknown>) =>
    request<Row>(`/admin/optimization-categories/${id}`, { method: 'PATCH', body: patch, authedAdmin: true }),
  adminDeleteOptimizationCategory: (id: string) =>
    request<{ ok: boolean }>(`/admin/optimization-categories/${id}`, { method: 'DELETE', authedAdmin: true }),

  // ------------------------------------------------------------ admin releases
  adminAppVersions: () => request<{ data: Row[] }>('/admin/app-versions', { authedAdmin: true }),
  adminCreateAppVersion: (input: Record<string, unknown>) =>
    request<Row>('/admin/app-versions', { method: 'POST', body: input, authedAdmin: true }),
  adminReconcileLatestVersion: (id: string) =>
    request<{ ok: boolean }>(`/admin/app-versions/${id}/state`, { method: 'PATCH', authedAdmin: true }),
  adminDeleteAppVersion: (id: string) =>
    request<{ ok: boolean }>(`/admin/app-versions/${id}`, { method: 'DELETE', authedAdmin: true }),

  // ------------------------------------------------------------ admin users
  adminUsers: (params?: { q?: string; status?: string; page?: string; limit?: string }) =>
    adminList<Row>(`/admin/users${buildQuery(params ?? {})}`),
  adminUpdateUserStatus: (id: string, status: string) =>
    request<Row>(`/admin/users/${id}`, { method: 'PATCH', body: { status }, authedAdmin: true }),

  // ------------------------------------------------------------ admin admins
  adminAdmins: () => request<{ data: Row[] }>('/admin/admins', { authedAdmin: true }),
  adminCreateAdmin: (input: Record<string, unknown>) =>
    request<Row>('/admin/admins', { method: 'POST', body: input, authedAdmin: true }),
  adminUpdateAdmin: (id: string, patch: Record<string, unknown>) =>
    request<Row>(`/admin/admins/${id}`, { method: 'PATCH', body: patch, authedAdmin: true }),

  // ------------------------------------------------------------ admin audit
  adminAuditLogs: (params?: { entityType?: string; q?: string; page?: string; limit?: string }) =>
    request<{ data: Row[] }>(`/admin/audit-logs${buildQuery(params ?? {})}`, { authedAdmin: true }),

  // ------------------------------------------------------- admin crash reports
  adminClientErrors: (params?: { resolved?: string; limit?: string }) =>
    request<{ data: Row[] }>(`/admin/client-errors${buildQuery(params ?? {})}`, { authedAdmin: true }),
  adminResolveClientError: (id: string, resolved: boolean) =>
    request<{ ok: true }>(`/admin/client-errors/${id}`, { method: 'PATCH', body: { resolved }, authedAdmin: true }),
  adminDeleteClientError: (id: string) =>
    request<{ ok: true }>(`/admin/client-errors/${id}`, { method: 'DELETE', authedAdmin: true }),

  // ------------------------------------------------------------ admin settings
  adminSettings: () => request<{ data: Record<string, unknown> }>('/admin/settings', { authedAdmin: true }),
  adminUpdateSettings: (patch: Record<string, unknown>) =>
    request<{ data: Record<string, unknown> }>('/admin/settings', { method: 'PUT', body: { settings: patch }, authedAdmin: true }),
};
