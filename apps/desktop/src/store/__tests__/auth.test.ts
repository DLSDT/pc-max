import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * The error has to come from the SAME module instance the store imports.
 * vi.resetModules() gives each test a fresh copy of @/lib/api, and an ApiError
 * built from a different copy fails `instanceof` inside isNetworkError — the
 * store would then read a network failure as a rejection and sign the user out.
 */
async function mockApi(reject: 'network' | 'http') {
  vi.doMock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    const err =
      reject === 'network'
        ? new actual.ApiError('offline', 0, null, 'network')
        : new actual.ApiError('Unauthorized', 401, null, 'http');
    return { ...actual, api: { ...actual.api, me: vi.fn().mockRejectedValue(err) }, setAuthToken: vi.fn() };
  });
  vi.doMock('@/lib/favorites', () => ({ syncFavoritesFromServer: vi.fn() }));
}

/**
 * The two ways a session restore can fail look identical to a naive catch, and
 * treating them the same broke the app in opposite directions:
 *
 *  - "the server said no" must sign the user out;
 *  - "I could not reach the server" must NOT, because this app is offline-first
 *    and the login screen it would redirect to needs the network itself.
 */
describe('useAuth.restore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the session when the API is unreachable', async () => {
    await mockApi('network');

    const { useAuth } = await import('@/store/auth');
    const user = { id: 'u1', email: 'a@b.test' } as never;
    useAuth.setState({ user, ready: false, offline: false });

    await useAuth.getState().restore();

    const s = useAuth.getState();
    expect(s.user, 'a dropped connection is not a logout').toBe(user);
    expect(s.offline, 'the UI needs to know the session is degraded').toBe(true);
    expect(s.ready, 'the guard must get a decision').toBe(true);
  });

  it('signs out when the server actually rejects the session', async () => {
    await mockApi('http');

    const { useAuth } = await import('@/store/auth');
    useAuth.setState({ user: { id: 'u1', email: 'a@b.test' } as never, ready: false, offline: false });

    await useAuth.getState().restore();

    const s = useAuth.getState();
    expect(s.user, 'a rejected session must not survive').toBeNull();
    expect(s.offline).toBe(false);
    expect(s.ready).toBe(true);
  });

  it('does not resurrect a session that was never there', async () => {
    await mockApi('network');

    const { useAuth } = await import('@/store/auth');
    useAuth.setState({ user: null, ready: false, offline: false });

    await useAuth.getState().restore();

    // Offline with no saved user is still signed out — the guard should send
    // them to login, not into an empty app.
    expect(useAuth.getState().user).toBeNull();
    expect(useAuth.getState().offline).toBe(false);
  });
});
