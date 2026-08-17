import { create } from 'zustand';
import type { UserPublic } from '@goh/types';
import { api, setAuthToken } from '@/lib/api';
import { syncFavoritesFromServer } from '@/lib/favorites';

interface AuthState {
  /** In-memory session. The access token is never persisted to disk. */
  user: UserPublic | null;
  ready: boolean;
  restoring: boolean;
  /** Restore the session from the httpOnly refresh cookie (app boot). */
  restore: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (body: { identifier: string; password: string; username?: string; otp: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>()((set) => ({
  user: null,
  ready: false,
  restoring: false,

  restore: async () => {
    if (useAuth.getState().restoring) return;
    set({ restoring: true });
    try {
      const me = await api.me();
      set({ user: me, ready: true });
      await syncFavoritesFromServer();
    } catch {
      setAuthToken(null);
      set({ user: null, ready: true });
    } finally {
      set({ restoring: false });
    }
  },

  login: async (identifier, password) => {
    const res = await api.login({ identifier, password });
    setAuthToken(res.accessToken);
    set({ user: res.user });
    await syncFavoritesFromServer();
  },

  register: async ({ identifier, password, username, otp }) => {
    const res = await api.register({ identifier, password, ...(username ? { username } : {}), otp });
    setAuthToken(res.accessToken);
    set({ user: res.user });
    await syncFavoritesFromServer();
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      // best-effort — the local session is cleared regardless
    }
    setAuthToken(null);
    set({ user: null });
  },
}));
