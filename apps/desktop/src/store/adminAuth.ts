import { create } from 'zustand';
import type { AdminMe } from '@goh/types';
import { api, setAdminAuthToken } from '@/lib/api';
import { setAdminSeen } from '@/lib/authGate';

interface AdminAuthState {
  /** In-memory admin session — entirely separate from the end-user session in store/auth.ts. */
  admin: AdminMe | null;
  ready: boolean;
  restoring: boolean;
  /** Restore the admin session from its own httpOnly refresh cookie (app boot). */
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAdminAuth = create<AdminAuthState>()((set) => ({
  admin: null,
  ready: false,
  restoring: false,

  restore: async () => {
    if (useAdminAuth.getState().restoring) return;
    set({ restoring: true });
    try {
      const me = await api.adminMe();
      set({ admin: me, ready: true });
    } catch {
      setAdminAuthToken(null);
      set({ admin: null, ready: true });
    } finally {
      set({ restoring: false });
    }
  },

  login: async (email, password) => {
    const res = await api.adminLogin({ email, password });
    setAdminAuthToken(res.accessToken);
    // From here on this machine has an admin session worth restoring on a
    // later launch. Nothing else records that: the session itself is in memory
    // and the refresh cookie is httpOnly, so it cannot be seen from here.
    setAdminSeen(true);
    set({ admin: { ...res.admin, lastLoginAt: null }, ready: true });
  },

  logout: async () => {
    try {
      await api.adminLogout();
    } catch {
      // best-effort — the local session is cleared regardless
    }
    setAdminAuthToken(null);
    setAdminSeen(false);
    set({ admin: null });
  },
}));
