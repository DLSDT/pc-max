/**
 * What the auth gate should do with the current session state.
 *
 * Pulled out of the component because getting it wrong does not throw or log —
 * it renders a spinner forever, which is indistinguishable from a slow network
 * until someone waits long enough to be sure. A pure function can be asserted
 * on directly.
 */
export type AuthGate = 'wait' | 'allow' | 'login';

export interface AuthGateState {
  /** The user session restore has resolved, one way or the other. */
  ready: boolean;
  /** A signed-in end user, if there is one. */
  user: unknown;
  /** The admin session restore has resolved. False until something asks. */
  adminReady: boolean;
  /** A signed-in admin, if there is one. */
  admin: unknown;
  /** Whether an admin has ever signed in on this machine — see `shouldProbeAdmin`. */
  adminSeen: boolean;
}

/**
 * The admin session is NOT restored at app boot: an end user would pay for a
 * request that, for them, can only fail. So `adminReady` stays false until
 * something asks — and waiting on it unconditionally means waiting forever.
 *
 * The order below is what keeps both properties. A user session answers the
 * question on its own, so it is checked first and the admin probe never runs
 * for the common case. Only once the user side has come back empty does the
 * admin session change the outcome, and only then is it worth waiting for.
 */
export function authGate(s: AuthGateState): AuthGate {
  if (!s.ready) return 'wait';
  if (s.user) return 'allow';
  // No user. An admin signing in through the shared form holds an admin
  // session rather than a user one, and that still counts as authenticated —
  // but we cannot say they are signed out until we have asked. Only wait for
  // an answer we are actually going to go and get.
  if (s.adminSeen && !s.adminReady) return 'wait';
  return s.admin ? 'allow' : 'login';
}

/**
 * True when the admin session is worth restoring — see `authGate`.
 *
 * `adminSeen` is the last condition and it is what keeps the login screen
 * cheap. Asking about an admin session on a machine where no admin has ever
 * signed in costs three requests — the probe, its 401, and the refresh attempt
 * that 401s too — in front of a screen that needs none of them. The answer on
 * such a machine is known in advance.
 */
export function shouldProbeAdmin(
  s: Pick<AuthGateState, 'ready' | 'user' | 'adminReady'> & { adminSeen: boolean },
): boolean {
  return s.ready && !s.user && !s.adminReady && s.adminSeen;
}

const ADMIN_SEEN_KEY = 'goh_admin_seen';

/** Whether an admin has ever signed in on this machine. */
export function adminSeen(): boolean {
  try {
    return localStorage.getItem(ADMIN_SEEN_KEY) === '1';
  } catch {
    // Private mode, or storage disabled. Probing is the safe answer: a slower
    // login screen beats an admin who cannot get back into the panel.
    return true;
  }
}

/** Record — or forget — that this machine has an admin session to restore. */
export function setAdminSeen(seen: boolean): void {
  try {
    if (seen) localStorage.setItem(ADMIN_SEEN_KEY, '1');
    else localStorage.removeItem(ADMIN_SEEN_KEY);
  } catch {
    // Nothing to do: the flag is an optimisation, not a source of truth.
  }
}
