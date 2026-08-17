/**
 * Runtime configuration for the desktop app.
 *
 * The API base URL is injected at build time via VITE_API_URL. No secrets ever
 * live in the desktop bundle — it only talks to the public, anonymous API.
 */
export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api/v1',
  appVersion: '0.1.0',
  syncIntervalMs: 5 * 60 * 1000,
} as const;
