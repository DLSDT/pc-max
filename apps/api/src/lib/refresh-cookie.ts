import type { CookieSerializeOptions } from '@fastify/cookie';
import { config } from '../config';

/**
 * Options for the two refresh cookies (end-user and admin).
 *
 * `sameSite` is the whole point of this file. Both cookies were 'strict', and
 * the desktop app ALWAYS talks to the API cross-site — the packaged app runs on
 * tauri.localhost and calls pc-maxapp.rixy.ir — so the browser never attached
 * them. /auth/refresh answered "No refresh token" every time, which meant the
 * 15-minute access token could never be renewed and every user was signed out
 * a quarter of an hour after logging in.
 *
 * 'none' is what a native app on another origin requires, and browsers only
 * honour it alongside `secure`, so it is used exactly where HTTPS is available.
 * Development stays on 'lax' because a `secure` cookie is dropped over plain
 * http and the local stack would break instead.
 *
 * The CSRF exposure 'none' opens is limited here: a hostile page can cause a
 * refresh, but CORS stops it reading the response, so it cannot take the access
 * token — it can only rotate a session it cannot see.
 */
export function refreshCookieOptions(): CookieSerializeOptions {
  return buildRefreshCookieOptions(config.NODE_ENV === 'production', config.REFRESH_TTL_DAYS);
}

/**
 * The policy itself, free of config so it can be asserted directly — importing
 * config under NODE_ENV=production trips the production boot guards.
 */
export function buildRefreshCookieOptions(production: boolean, ttlDays: number): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: production ? 'none' : 'lax',
    secure: production,
    path: '/',
    maxAge: ttlDays * 24 * 60 * 60,
  };
}

/** Must mirror the set options or the browser will not match the cookie. */
export function clearRefreshCookieOptions(): CookieSerializeOptions {
  const { maxAge: _maxAge, ...rest } = refreshCookieOptions();
  return rest;
}
