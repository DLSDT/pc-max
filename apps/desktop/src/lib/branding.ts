/**
 * Remote branding & theme (Phase 15).
 *
 * The admin panel publishes `branding` inside the remote config (`/config`):
 *   { brand_name, primary_color, tagline, logo_url }
 *
 * This module re-themes the running app by overriding the CSS custom
 * properties in `:root` — no rebuild or update required. The tailwind palette
 * is driven by HSL triplets (e.g. `--primary: 262 84% 62%`), so we convert the
 * admin's hex color to an HSL triplet at runtime.
 */

export interface Branding {
  brand_name?: string | null;
  primary_color?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
}

/** #rrggbb → "h s% l%" triplet used by the app's CSS variables. */
export function hexToHslTriplet(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return `${Math.round(h * 60)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const STORAGE_KEY = 'goh_branding_v1';

/** Apply branding: CSS variables + persisted copy (used pre-sync on next boot). */
export function applyBranding(branding: Branding): void {
  const color = branding.primary_color ?? '#E50914';
  const triplet = hexToHslTriplet(color);
  if (triplet) {
    const root = document.documentElement;
    root.style.setProperty('--primary', triplet);
    root.style.setProperty('--ring', triplet);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...branding, appliedAt: new Date().toISOString() }));
  } catch {
    // Non-fatal.
  }
  if (branding.brand_name) {
    document.title = branding.brand_name;
  }
}

/** Last applied branding (fast boot paint before the config fetch resolves). */
export function loadCachedBranding(): Branding | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Branding & { appliedAt?: string };
    return parsed;
  } catch {
    return null;
  }
}

/** Extract the branding object from a raw /config payload. */
export function brandingFromConfig(config: Record<string, unknown>): Branding {
  return (config.branding as Branding | undefined) ?? {};
}
