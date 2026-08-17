import type { HardwareProfileInput } from '@goh/types';
import type { PackagePublic } from '@goh/types';

/**
 * Hardware ↔ Optimization Package compatibility engine (Phase 6).
 *
 * A package declares optional rules (GPU vendor/family, minimum VRAM/RAM,
 * minimum Windows version, architecture). This module decides whether the
 * user's detected PC meets them. "any" / absent rules always match, so
 * vendor-agnostic packages remain compatible everywhere.
 *
 * Pure functions on purpose — unit-tested in `src/lib/__tests__`.
 */

export type Compatibility = 'compatible' | 'incompatible' | 'unknown';

export interface PackageCompatibility {
  /** 'unknown' when the hardware profile lacks the fields a rule needs. */
  result: Compatibility;
  /** Human-readable reason when incompatible (i18n keys, English fallback). */
  reason: string | null;
  /** Which rules matched (for the "Compatible with your PC" badge). */
  matched: string[];
}

function compareWindows(have: string | undefined, min: string | null | undefined): boolean | null {
  if (!min || !have) return null;
  const parse = (v: string): number[] => (v.match(/\d+/g) ?? []).map(Number);
  const a = parse(have);
  const b = parse(min);
  if (a.length === 0 || b.length === 0) return null;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

/** Does this package's GPU family rule match the detected GPU model/vendor? */
function gpuFamilyMatches(family: string | null | undefined, hw: HardwareProfileInput): boolean | null {
  if (!family) return null;
  const gpu = `${hw.gpuModel ?? ''} ${hw.gpuVendor ?? ''}`.toLowerCase();
  // Normalize: "RTX 30" should match "RTX 3060", "GeForce RTX 3050 Ti", etc.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const familyNorm = norm(family);
  // Family tokens: ["rtx", "30"] — the model must contain every token.
  const tokens = familyNorm.split(/\s+/);
  return tokens.every((tok) => gpu.includes(tok));
}

export function packageCompatibility(pkg: PackagePublic, hw: HardwareProfileInput | null | undefined): PackageCompatibility {
  if (!hw) return { result: 'unknown', reason: null, matched: [] };

  const matched: string[] = [];
  const missing: string[] = [];

  // GPU vendor
  if (pkg.gpuVendor && pkg.gpuVendor !== 'any') {
    if (hw.gpuVendor && hw.gpuVendor !== 'unknown' && hw.gpuVendor !== pkg.gpuVendor) {
      return { result: 'incompatible', reason: `Requires a ${pkg.gpuVendor} GPU`, matched };
    }
    if (!hw.gpuVendor || hw.gpuVendor === 'unknown') missing.push('GPU vendor');
    else matched.push('vendor');
  }

  // GPU family
  const fam = gpuFamilyMatches(pkg.gpuFamily, hw);
  if (pkg.gpuFamily && fam === false) {
    return { result: 'incompatible', reason: `Requires a ${pkg.gpuFamily} GPU`, matched };
  }
  if (pkg.gpuFamily && fam === null) missing.push('GPU family');
  else if (pkg.gpuFamily) matched.push('family');

  // VRAM
  if (pkg.minVramMb != null) {
    if (hw.vramMb != null) {
      if (hw.vramMb < pkg.minVramMb) {
        return { result: 'incompatible', reason: `Requires at least ${pkg.minVramMb} MB VRAM`, matched };
      }
      matched.push('VRAM');
    } else {
      missing.push('VRAM');
    }
  }

  // RAM
  if (pkg.minRamGb != null) {
    if (hw.ramGb != null) {
      if (hw.ramGb < pkg.minRamGb) {
        return { result: 'incompatible', reason: `Requires at least ${pkg.minRamGb} GB RAM`, matched };
      }
      matched.push('RAM');
    } else {
      missing.push('RAM');
    }
  }

  // Windows version
  const winOk = compareWindows(hw.windowsVersion, pkg.minWindows);
  if (pkg.minWindows && winOk === false) {
    return { result: 'incompatible', reason: `Requires Windows ${pkg.minWindows} or newer`, matched };
  }
  if (pkg.minWindows && winOk === null) missing.push('Windows version');
  else if (pkg.minWindows) matched.push('Windows');

  // Architecture
  if (pkg.arch && pkg.arch !== 'any') {
    if (hw.arch && hw.arch !== pkg.arch) {
      return { result: 'incompatible', reason: `Requires ${pkg.arch}`, matched };
    }
    if (!hw.arch) missing.push('architecture');
    else matched.push('architecture');
  }

  // A package with no rules is always compatible; with rules, if we lack the
  // hardware fields we can't be sure (yet) — surface that instead of guessing.
  if (pkg.gpuVendor || pkg.gpuFamily || pkg.minVramMb != null || pkg.minRamGb != null || pkg.minWindows || (pkg.arch && pkg.arch !== 'any')) {
    if (missing.length > 0 && matched.length === 0) {
      return { result: 'unknown', reason: `Detect hardware to check (missing: ${missing.join(', ')})`, matched };
    }
  }

  return { result: 'compatible', reason: null, matched };
}

/** Sort compatible packages first, then unknown, then incompatible. */
export function rankPackages(pkgs: PackagePublic[], hw: HardwareProfileInput | null | undefined): PackagePublic[] {
  const scored = pkgs.map((p) => ({ p, c: packageCompatibility(p, hw) }));
  const order: Record<Compatibility, number> = { compatible: 0, unknown: 1, incompatible: 2 };
  return scored.sort((a, b) => order[a.c.result] - order[b.c.result] || a.p.name.localeCompare(b.p.name)).map((s) => s.p);
}

export type { PackagePublic };
