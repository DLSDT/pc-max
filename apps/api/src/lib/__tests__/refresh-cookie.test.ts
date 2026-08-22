import { describe, expect, it } from 'vitest';
import { buildRefreshCookieOptions, clearRefreshCookieOptions, refreshCookieOptions } from '../refresh-cookie';

/**
 * The desktop app is ALWAYS cross-site with the API — the packaged app runs on
 * tauri.localhost and calls pc-maxapp.rixy.ir. A SameSite=Strict cookie is not
 * attached to those requests, so /auth/refresh answered "No refresh token"
 * every time and the 15-minute access token could never be renewed: every user
 * was signed out a quarter of an hour after logging in, with nothing in the
 * logs to say why.
 */
describe('refresh cookie policy', () => {
  it('is cross-site capable in production', () => {
    const opts = buildRefreshCookieOptions(true, 30);
    // 'strict' and 'lax' both drop the cookie on a cross-site XHR from the app.
    expect(opts.sameSite, 'must be sent cross-site or sessions cannot refresh').toBe('none');
    // Browsers reject SameSite=None unless the cookie is also Secure.
    expect(opts.secure, 'SameSite=None requires Secure').toBe(true);
    expect(opts.httpOnly, 'the token must stay unreadable to scripts').toBe(true);
  });

  it('stays usable over plain http in development', () => {
    const opts = buildRefreshCookieOptions(false, 30);
    // A Secure cookie is dropped over http, which would break the local stack.
    expect(opts.secure).toBe(false);
    expect(opts.sameSite).not.toBe('none');
  });

  it('carries the configured lifetime', () => {
    expect(buildRefreshCookieOptions(true, 30).maxAge).toBe(30 * 24 * 60 * 60);
    expect(buildRefreshCookieOptions(true, 7).maxAge).toBe(7 * 24 * 60 * 60);
  });

  it('clears with the same attributes it was set with', () => {
    const set = refreshCookieOptions();
    const clear = clearRefreshCookieOptions();
    // A mismatch leaves the original cookie in place and logout does nothing.
    expect(clear.sameSite).toBe(set.sameSite);
    expect(clear.secure).toBe(set.secure);
    expect(clear.path).toBe(set.path);
    expect(clear).not.toHaveProperty('maxAge');
  });
});
