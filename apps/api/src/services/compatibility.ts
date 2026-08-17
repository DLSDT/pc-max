import type { HardwareProfileInput } from '@goh/validation';
import type { optimizationPackages } from '../db/schema';

/**
 * Compatibility engine — pure, deterministic matching.
 *
 * Rules (server-side, never trusted from the client):
 *  - GPU vendor mismatch            → package excluded
 *  - VRAM below the package minimum → package excluded
 *  - RAM below the package minimum  → package excluded
 *  - Windows version below minimum  → package excluded
 *  - Architecture mismatch          → package excluded
 *  - GPU family match / any-family  → bonus
 *  - Default package                → small bonus (tie-breaker)
 */

export interface ScoredPackage {
  pkg: typeof optimizationPackages.$inferSelect;
  score: number;
  reasons: string[];
  compatible: boolean;
}

export function parseWindowsVersion(value: string | undefined | null): number[] {
  if (!value) return [];
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!m) return [];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function versionAtLeast(have: number[] | undefined, need: string | null | undefined): boolean {
  if (!need) return true;
  const required = parseWindowsVersion(need);
  if (required.length === 0) return true; // unparseable requirement → treat as satisfied
  if (!have || have.length === 0) return false;
  for (let i = 0; i < required.length; i++) {
    const a = have[i] ?? 0;
    const b = required[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

export function normalizeGpuVendor(model: string | undefined | null): 'nvidia' | 'amd' | 'intel' | 'unknown' {
  const m = (model ?? '').toLowerCase();
  if (m.includes('nvidia') || m.includes('geforce') || m.includes('rtx') || m.includes('gtx')) return 'nvidia';
  if (m.includes('radeon') || m.includes('amd') || m.includes('rx ')) return 'amd';
  if (m.includes('intel') || m.includes('arc') || m.includes('uhd') || m.includes('iris')) return 'intel';
  return 'unknown';
}

/** Score one package against a hardware profile. */
export function scorePackage(
  pkg: typeof optimizationPackages.$inferSelect,
  hw: HardwareProfileInput,
): ScoredPackage {
  const reasons: string[] = [];
  let score = 0;

  // GPU vendor
  const detectedVendor = hw.gpuVendor ?? normalizeGpuVendor(hw.gpuModel);
  if (pkg.gpuVendor !== 'any' && detectedVendor !== 'unknown') {
    if (pkg.gpuVendor === detectedVendor) {
      score += 40;
      reasons.push(`GPU vendor match (${detectedVendor})`);
    } else {
      return { pkg, score: -1, reasons: [`GPU vendor mismatch (package: ${pkg.gpuVendor}, detected: ${detectedVendor})`], compatible: false };
    }
  }

  // GPU family
  if (pkg.gpuFamily) {
    const model = (hw.gpuModel ?? '').toLowerCase();
    if (model && model.includes(pkg.gpuFamily.toLowerCase())) {
      score += 30;
      reasons.push(`GPU family match (${pkg.gpuFamily})`);
    } else if (model) {
      score -= 20;
      reasons.push(`GPU family outside ${pkg.gpuFamily}`);
    }
  }

  // VRAM
  if (pkg.minVramMb && hw.vramMb != null) {
    if (hw.vramMb >= pkg.minVramMb) {
      score += 15;
      reasons.push(`VRAM ${hw.vramMb} MB ≥ ${pkg.minVramMb} MB`);
    } else {
      return { pkg, score: -1, reasons: [`VRAM ${hw.vramMb} MB below required ${pkg.minVramMb} MB`], compatible: false };
    }
  }

  // RAM
  if (pkg.minRamGb && hw.ramGb != null) {
    if (hw.ramGb >= pkg.minRamGb) {
      score += 10;
      reasons.push(`RAM ${hw.ramGb} GB ≥ ${pkg.minRamGb} GB`);
    } else {
      return { pkg, score: -1, reasons: [`RAM ${hw.ramGb} GB below required ${pkg.minRamGb} GB`], compatible: false };
    }
  }

  // Windows version
  if (pkg.minWindows) {
    if (versionAtLeast(parseWindowsVersion(hw.windowsVersion), pkg.minWindows)) {
      score += 5;
      reasons.push(`Windows ${hw.windowsVersion ?? '?'} ≥ ${pkg.minWindows}`);
    } else {
      return { pkg, score: -1, reasons: [`Windows ${hw.windowsVersion ?? '?'} below required ${pkg.minWindows}`], compatible: false };
    }
  }

  // Architecture
  if (pkg.arch !== 'any') {
    const detectedArch = (hw.arch ?? '').toLowerCase();
    if (detectedArch === pkg.arch) {
      score += 5;
    } else if (detectedArch) {
      return { pkg, score: -1, reasons: [`Architecture mismatch (package: ${pkg.arch}, detected: ${detectedArch})`], compatible: false };
    }
  }

  if (pkg.isDefault) score += 5;
  if (pkg.targetFps) score += Math.min(5, Math.floor(pkg.targetFps / 60));

  return { pkg, score, reasons, compatible: true };
}

/** Pick the best compatible package for a game's published set. */
export function recommend(
  published: (typeof optimizationPackages.$inferSelect)[],
  hw: HardwareProfileInput,
): { recommended: typeof optimizationPackages.$inferSelect | null; reasons: string[]; scored: ScoredPackage[] } {
  // Highest score first; ties break toward the most recently published release.
  const scored = published
    .map((pkg) => scorePackage(pkg, hw))
    .sort((a, b) => b.score - a.score || (b.pkg.publishedAt?.getTime() ?? 0) - (a.pkg.publishedAt?.getTime() ?? 0));
  const compatible = scored.filter((s) => s.compatible);
  const best = compatible[0] ?? null;
  return {
    recommended: best?.pkg ?? null,
    reasons: best?.reasons ?? (scored[0]?.reasons ?? ['No compatible package found for this hardware']),
    scored,
  };
}
