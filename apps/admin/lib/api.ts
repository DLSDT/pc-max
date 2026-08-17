'use client';

import type { AuthResponse } from '@goh/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const ACCESS_KEY = 'goh_access_token';

let cachedToken: string | null = null;

export function getAccessToken(): string | null {
  if (cachedToken === null) {
    cachedToken = typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_KEY) : null;
  }
  return cachedToken;
}

export function setAccessToken(token: string | null) {
  cachedToken = token;
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(ACCESS_KEY, token);
  else window.localStorage.removeItem(ACCESS_KEY);
}

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

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST' });
    if (!res.ok) return false;
    const data = (await res.json()) as AuthResponse;
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

interface ApiFetchOptions extends RequestInit {
  /** Skip the silent-refresh retry (e.g. auth endpoints). */
  noRetry?: boolean;
}

/** Fetch against the API with bearer token + automatic refresh on 401. */
export async function apiFetch<T>(path: string, init: ApiFetchOptions = {}): Promise<T> {
  const { noRetry, ...fetchInit } = init;
  const run = async (): Promise<T> => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    const token = getAccessToken();
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(`${API}${path}`, { ...fetchInit, headers });

    if (res.status === 401 && !noRetry) {
      if (await tryRefresh()) return run();
      window.location.href = '/login';
      throw new ApiError('Session expired', 401, null);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: { message?: string; details?: unknown } } | null;
      throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status, body);
    }
    return (await res.json()) as T;
  };
  return run();
}

/** Upload a file directly to object storage via the presigned URL. */
export async function uploadFile(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  });
  if (!res.ok) throw new ApiError(`Upload failed (${res.status})`, res.status, null);
}

/** Human-friendly date. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
