import { describe, expect, it } from 'vitest';
import { authGate, shouldProbeAdmin } from '@/lib/authGate';

const state = (over: Partial<Parameters<typeof authGate>[0]> = {}) => ({
  ready: true,
  user: null as unknown,
  adminReady: false,
  admin: null as unknown,
  // The machine an admin has signed in on before — the case with a question
  // still to answer. The plain-user machine is covered separately below.
  adminSeen: true,
  ...over,
});

describe('the gate in front of every signed-in route', () => {
  it('waits while the user session is still being restored', () => {
    expect(authGate(state({ ready: false }))).toBe('wait');
  });

  it('lets a signed-in user through without waiting on the admin session', () => {
    // The regression this exists for. Boot stopped restoring the admin session
    // — it costs an end user a request that can only fail — but the gate still
    // waited for `adminReady`, which nothing was ever going to set. Every route
    // behind this rendered a spinner and nothing else, forever, with no error
    // in the console and a perfectly healthy network tab.
    expect(authGate(state({ user: { id: 'u1' }, adminReady: false }))).toBe('allow');
  });

  it('waits for the admin answer only once the user side has come back empty', () => {
    expect(authGate(state({ user: null, adminReady: false }))).toBe('wait');
  });

  it('lets an admin through — the shared sign-in form gives them an admin session, not a user one', () => {
    expect(authGate(state({ adminReady: true, admin: { id: 'a1' } }))).toBe('allow');
  });

  it('sends a genuinely signed-out visitor to the login screen', () => {
    expect(authGate(state({ adminReady: true, admin: null }))).toBe('login');
  });

  it('does not wait on a machine where no admin has ever signed in', () => {
    // Nothing will ask, so there is no answer coming. Waiting for one here is
    // the spinner-forever bug in its other form.
    expect(authGate(state({ adminSeen: false, adminReady: false }))).toBe('login');
  });
});

describe('when the admin session is worth asking about', () => {
  const probe = (over: Partial<Parameters<typeof shouldProbeAdmin>[0]> = {}) =>
    shouldProbeAdmin({ ready: true, user: null, adminReady: false, adminSeen: true, ...over });

  it('is not asked for while the user session is still resolving', () => {
    expect(probe({ ready: false })).toBe(false);
  });

  it('is never asked for on behalf of a signed-in user — that is the request boot dropped', () => {
    expect(probe({ user: { id: 'u1' } })).toBe(false);
  });

  it('is not asked for on a machine no admin has ever used — three failing requests before a login screen', () => {
    expect(probe({ adminSeen: false })).toBe(false);
  });

  it('is asked for exactly once the user session is known to be empty', () => {
    expect(probe()).toBe(true);
  });

  it('is not asked for twice', () => {
    expect(probe({ adminReady: true })).toBe(false);
  });
});
