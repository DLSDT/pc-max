/**
 * Match a detected GPU to an OptiScaler profile.
 *
 * Profiles are named by the administrator, not by us — "NVIDIA P1-6X",
 * "AMD P2-6X", "XESS P1-2X" in the current package — so this reads the vendor
 * out of the name rather than assuming a fixed list. A package whose profiles
 * are named differently degrades to "no recommendation", which is honest;
 * guessing would put an AMD config on an NVIDIA card.
 *
 * The result is a *recommendation*. Every profile stays selectable: detection
 * can be wrong (a laptop with switchable graphics reports whichever adapter
 * answered first), and a user who knows better must not be locked out of
 * their own machine.
 */
import type { HardwareProfileInput } from '@goh/validation';

export type GpuVendor = 'nvidia' | 'amd' | 'intel';

/** Which vendor a profile name targets, or null when it names none. */
export function profileVendor(name: string): GpuVendor | null {
  const n = name.toLowerCase();
  if (n.includes('nvidia') || n.includes('geforce') || n.includes('rtx')) return 'nvidia';
  if (n.includes('amd') || n.includes('radeon') || n.includes('fsr')) return 'amd';
  // XeSS is Intel's upscaler, but it also runs on other vendors' cards — it is
  // the sensible fallback for Intel rather than an Intel-only profile.
  if (n.includes('xess') || n.includes('intel') || n.includes('arc')) return 'intel';
  return null;
}

/** Normalise whatever detection produced into one of the three vendors. */
export function normalizeVendor(profile: HardwareProfileInput | null): GpuVendor | null {
  const raw = `${profile?.gpuVendor ?? ''} ${profile?.gpuModel ?? ''}`.toLowerCase();
  if (!raw.trim()) return null;
  if (/nvidia|geforce|rtx|gtx/.test(raw)) return 'nvidia';
  if (/amd|radeon|\brx\b/.test(raw)) return 'amd';
  if (/intel|arc|iris|uhd/.test(raw)) return 'intel';
  return null;
}

/**
 * The profile to preselect for this machine.
 *
 * Prefers a profile matching the detected vendor, in the order the admin
 * uploaded them (so "P1" comes before "P2" when both match). Falls back to an
 * Intel/XeSS profile for an Intel GPU only — never across vendors, because a
 * vendor mismatch is exactly the mistake this function exists to prevent.
 * Returns null when nothing matches, and the caller leaves the choice open.
 */
export function recommendProfile(variants: string[], vendor: GpuVendor | null): string | null {
  if (!vendor || variants.length === 0) return null;
  return variants.find((v) => profileVendor(v) === vendor) ?? null;
}

/** True when the user has picked a profile built for a different vendor. */
export function isVendorMismatch(selected: string | null, vendor: GpuVendor | null): boolean {
  if (!selected || !vendor) return false;
  const target = profileVendor(selected);
  return target !== null && target !== vendor;
}

/**
 * Does this machine meet AI Optical Flow's requirement?
 *
 * It drives NVIDIA's Optical Flow engine through Streamline, which exists on
 * RTX 20-series and newer. A GTX card reports vendor "nvidia" and cannot run
 * it, so the series is checked rather than the vendor alone.
 */
export function supportsOpticalFlow(profile: HardwareProfileInput | null): boolean | null {
  const vendor = normalizeVendor(profile);
  if (vendor === null) return null; // unknown — do not claim either way
  if (vendor !== 'nvidia') return false;
  const model = (profile?.gpuModel ?? '').toLowerCase();
  if (!model) return null;
  // RTX 2xxx-5xxx. Matches "RTX 4070", "RTX A2000", "GeForce RTX 3080 Ti".
  return /rtx\s*a?\s*([2-5]\d{3})/.test(model) || /rtx\s*([2-5]\d{2,3})/.test(model);
}
