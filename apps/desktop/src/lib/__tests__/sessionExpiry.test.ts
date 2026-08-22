import { describe, expect, it, beforeEach } from 'vitest';
import { handleSessionExpired } from '../../store/auth';
import { useAuth } from '../../store/auth';
import { setAuthToken } from '../api';

/**
 * When the API gives up on a session — access token gone AND the refresh cookie
 * unable to renew it — the app has to notice. It used to throw "Session
 * expired" and nothing listened: the UI stayed in its signed-in state showing
 * the account, the library and the subscription while every request came back
 * 401.
 */
describe('handleSessionExpired', () => {
  beforeEach(() => {
    useAuth.setState({ user: null, offline: false, ready: false });
    setAuthToken(null);
  });

  it('clears a live session the server has rejected for good', () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.test' } as never, offline: false, ready: true });
    setAuthToken('stale-token');

    handleSessionExpired();

    expect(useAuth.getState().user, 'a dead session must not stay signed in').toBeNull();
    expect(useAuth.getState().ready, 'the guard needs a decision, not a spinner').toBe(true);
  });

  it('leaves an offline session alone', () => {
    const user = { id: 'u1', email: 'a@b.test' } as never;
    useAuth.setState({ user, offline: true, ready: true });

    handleSessionExpired();

    // Offline sessions have no token by design — a failed request there means
    // the server is unreachable, not that the session died.
    expect(useAuth.getState().user, 'offline must not be mistaken for expired').toBe(user);
    expect(useAuth.getState().offline).toBe(true);
  });

  it('does nothing when nobody is signed in', () => {
    handleSessionExpired();
    expect(useAuth.getState().user).toBeNull();
  });
});
