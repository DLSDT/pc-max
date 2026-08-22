import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserPublic } from '@goh/types';
import { api, isNetworkError, setAuthToken, setSessionExpiredHandler } from '@/lib/api';
import { syncFavoritesFromServer } from '@/lib/favorites';

interface AuthState {
  /** In-memory session. The access token is never persisted to disk. */
  user: UserPublic | null;
  ready: boolean;
  restoring: boolean;
  /**
   * The session was restored from the last known user because the server could
   * not be reached — the app is usable with cached content, but there is no
   * access token, so anything that talks to the API will fail until it comes
   * back. Cleared as soon as a real restore succeeds.
   */
  offline: boolean;
  /** Restore the session from the httpOnly refresh cookie (app boot). */
  restore: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (body: { identifier: string; password: string; username?: string; otp: string }) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * When the API gives up on the session — token expired and the refresh cookie
 * could not renew it — drop it here too, so the guard sends the user to sign in
 * instead of leaving them in a signed-in shell where nothing loads.
 */
export function handleSessionExpired(): void {
  const { user, offline } = useAuth.getState();
  // An offline session has no token by design; a failed request there means the
  // server is unreachable, not that the session is dead.
  if (!user || offline) return;
  setAuthToken(null);
  useAuth.setState({ user: null, offline: false, ready: true });
}

setSessionExpiredHandler(handleSessionExpired);

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      ready: false,
      restoring: false,
      offline: false,

      restore: async () => {
        if (useAuth.getState().restoring) return;
        // Persisted state rehydrates asynchronously, and App calls this on
        // mount — so without waiting, the catch below can look at a `user` that
        // simply has not loaded yet and conclude the session is gone. That put
        // an offline user on the login screen even with a valid saved session.
        //
        // `persist` is undefined where there is no storage to rehydrate from
        // (SSR, tests); optional access keeps restore() working there instead
        // of throwing before it starts.
        if (useAuth.persist && !useAuth.persist.hasHydrated()) {
          await useAuth.persist.rehydrate();
        }
        set({ restoring: true });
        try {
          const me = await api.me();
          set({ user: me, ready: true, offline: false });
          await syncFavoritesFromServer();
        } catch (err) {
          // "Could not reach the server" is not "you are signed out". This app
          // is offline-first — a whole cached catalogue sits on disk — and
          // treating a dropped connection as a logout strands the user at a
          // login screen that itself needs the network to work.
          if (isNetworkError(err) && useAuth.getState().user) {
            set({ ready: true, offline: true });
          } else {
            // The server answered and rejected us: really signed out.
            setAuthToken(null);
            set({ user: null, ready: true, offline: false });
          }
        } finally {
          set({ restoring: false });
        }
      },

      login: async (identifier, password) => {
        const res = await api.login({ identifier, password });
        setAuthToken(res.accessToken);
        set({ user: res.user, offline: false, ready: true });
        await syncFavoritesFromServer();
      },

      register: async ({ identifier, password, username, otp }) => {
        const res = await api.register({ identifier, password, ...(username ? { username } : {}), otp });
        setAuthToken(res.accessToken);
        set({ user: res.user, offline: false, ready: true });
        await syncFavoritesFromServer();
      },

      logout: async () => {
        try {
          await api.logout();
        } catch {
          // best-effort — the local session is cleared regardless
        }
        setAuthToken(null);
        set({ user: null, offline: false });
      },
    }),
    {
      name: 'goh_auth',
      // Identity only, so a returning user can open the app offline. The access
      // token stays in memory and is never written to disk — this records that
      // someone was signed in, not any authority to act as them. Every API call
      // still needs a real token and 401s without one.
      partialize: (s) => ({ user: s.user }),
      // A persisted `ready: true` would let the guard decide before the boot
      // restore has run; force the boot sequence every time.
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.ready = false;
          state.restoring = false;
          state.offline = false;
        }
      },
    },
  ),
);
