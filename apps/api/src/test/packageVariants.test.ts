/**
 * Profile (variant) resolution for OptiScaler-style packages.
 *
 * One package carries a base drop-in plus several mutually-exclusive profiles
 * that all supply the *same* filename (OptiScaler.ini). That collision is the
 * whole reason these tests exist: the manifest dedupe was keyed on destination
 * alone, which would have kept exactly one profile and silently dropped the
 * other five.
 */
import { describe, expect, it } from 'vitest';
import { packageVariants, resolveVariantFiles } from '../services/packages';

const at = (n: number) => new Date(2026, 0, 1, 0, 0, n);

const files = [
  { filename: 'OptiScaler.dll', destination: 'OptiScaler.dll', variant: null, sortOrder: 0, createdAt: at(0) },
  { filename: 'libxess.dll', destination: 'OptiScaler/libxess.dll', variant: null, sortOrder: 0, createdAt: at(1) },
  { filename: 'OptiScaler.ini', destination: 'OptiScaler.ini', variant: 'NVIDIA P1-6X', sortOrder: 0, createdAt: at(2) },
  { filename: 'OptiScaler.ini', destination: 'OptiScaler.ini', variant: 'NVIDIA P2-6X', sortOrder: 0, createdAt: at(3) },
  { filename: 'OptiScaler.ini', destination: 'OptiScaler.ini', variant: 'AMD P1-6X', sortOrder: 0, createdAt: at(4) },
  { filename: 'OptiScaler.ini', destination: 'OptiScaler.ini', variant: 'XESS P1-2X', sortOrder: 0, createdAt: at(5) },
];

describe('packageVariants', () => {
  it('lists each profile once, in upload order', () => {
    expect(packageVariants(files)).toEqual(['NVIDIA P1-6X', 'NVIDIA P2-6X', 'AMD P1-6X', 'XESS P1-2X']);
  });

  it('reports no profiles for a package that has none', () => {
    expect(packageVariants(files.filter((f) => f.variant === null))).toEqual([]);
  });

  it('does not list a profile twice when it contributes several files', () => {
    const multi = [
      ...files,
      { filename: 'extra.ini', destination: 'extra.ini', variant: 'AMD P1-6X', sortOrder: 0, createdAt: at(9) },
    ];
    expect(packageVariants(multi).filter((v) => v === 'AMD P1-6X')).toHaveLength(1);
  });
});

describe('resolveVariantFiles', () => {
  it('installs the base plus exactly one profile', () => {
    const resolved = resolveVariantFiles(files, 'AMD P1-6X');
    expect(resolved.map((f) => f.variant)).toEqual([null, null, 'AMD P1-6X']);
    // Only one OptiScaler.ini reaches the installer — two would be a duplicate
    // destination, which the native installer refuses outright.
    expect(resolved.filter((f) => f.destination === 'OptiScaler.ini')).toHaveLength(1);
  });

  it('never leaks another profile into the install', () => {
    for (const chosen of packageVariants(files)) {
      const others = resolveVariantFiles(files, chosen).filter((f) => f.variant !== null && f.variant !== chosen);
      expect(others, `${chosen} leaked ${others.map((f) => f.variant).join()}`).toEqual([]);
    }
  });

  it('resolves to base-only when nothing is selected', () => {
    // The route refuses this case for a package that has profiles; the helper
    // itself stays honest rather than guessing a default.
    expect(resolveVariantFiles(files, null).every((f) => f.variant === null)).toBe(true);
  });
});
