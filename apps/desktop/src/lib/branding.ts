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

/**
 * The lightness a brand colour needs to still read as a colour on the dark
 * theme's near-black background rather than as a dark shape.
 *
 * Burgundy is the case that forced this: #6E1226 is 25% light, which is
 * correct on off-white and nearly invisible on #131110. The dark theme has
 * always carried its own, lifted value — but an inline custom property on
 * `:root` beats any stylesheet rule, so a single remote colour applied to both
 * themes silently replaced it.
 */
const DARK_MIN_LIGHTNESS = 46;

/**
 * Saturation ceiling when a colour is lifted.
 *
 * Lightness alone is not enough. Burgundy raised from 25% to 46% at its own
 * 72% saturation is #CA2145 — a bright crimson, which is the colour this
 * palette was chosen to get away from. Damping saturation as it lifts keeps
 * it reading as a deep colour rather than a loud one.
 */
const DARK_MAX_SATURATION = 50;

/**
 * The same colour, lifted just enough to survive a dark background.
 *
 * The target is both directions at once: white text on it for buttons, and it
 * as an icon or accent on the page behind. At 36% the first was comfortable
 * (7.9:1) and the second was not readable at all (2.4:1). This lands at
 * 5.8:1 and 3.2:1 — AA for text on the button, AA for a non-text element
 * against the page.
 */
export function forDarkTheme(triplet: string): string {
  const m = /^(-?[\d.]+) ([\d.]+)% ([\d.]+)%$/.exec(triplet);
  if (!m) return triplet;
  const [, h, s, l] = m;
  if (Number(l) >= DARK_MIN_LIGHTNESS) return triplet;
  return `${h} ${Math.min(Number(s), DARK_MAX_SATURATION)}% ${DARK_MIN_LIGHTNESS}%`;
}

/**
 * Apply branding: CSS variables + persisted copy (used pre-sync on next boot).
 *
 * Nothing is overridden when the config carries no colour. The stylesheet is
 * the default, and it defines light and dark separately; a hardcoded fallback
 * here meant the app shipped one brand colour in the CSS and quietly painted
 * a different one over it on every boot.
 */
export function applyBranding(branding: Branding): void {
  const triplet = branding.primary_color ? hexToHslTriplet(branding.primary_color) : null;
  if (triplet) {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', triplet);
    root.style.setProperty('--brand-primary-dark', forDarkTheme(triplet));
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
