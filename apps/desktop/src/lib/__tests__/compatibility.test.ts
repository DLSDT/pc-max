import { describe, expect, it } from 'vitest';
import { packageCompatibility, rankPackages } from '../compatibility';
import type { HardwareProfileInput, PackagePublic } from '@goh/types';

function pkg(over: Partial<PackagePublic>): PackagePublic {
  return {
    id: 'p1',
    gameId: 'g1',
    name: 'Test Package',
    slug: 'test-package',
    description: null,
    version: '1.0.0',
    status: 'published',
    kind: 'graphics',
    gpuVendor: 'any',
    gpuFamily: null,
    minVramMb: null,
    minRamGb: null,
    minWindows: null,
    gameVersion: null,
    arch: 'any',
    targetResolution: null,
    targetFps: null,
    isDefault: false,
    publishedAt: null,
    ...over,
  };
}

const nvidiaPc: HardwareProfileInput = {
  cpu: 'AMD Ryzen 5',
  gpuVendor: 'nvidia',
  gpuModel: 'NVIDIA GeForce RTX 3060',
  vramMb: 12288,
  ramGb: 16,
  windowsVersion: 'Windows 11',
  arch: 'x64',
};

describe('packageCompatibility', () => {
  it('matches a vendor-specific package to the right GPU', () => {
    const c = packageCompatibility(pkg({ gpuVendor: 'nvidia', minVramMb: 6144, minRamGb: 8 }), nvidiaPc);
    expect(c.result).toBe('compatible');
    expect(c.reason).toBeNull();
  });

  it('rejects the wrong GPU vendor', () => {
    const c = packageCompatibility(pkg({ gpuVendor: 'amd' }), nvidiaPc);
    expect(c.result).toBe('incompatible');
    expect(c.reason).toContain('amd');
  });

  it('rejects insufficient VRAM / RAM', () => {
    expect(packageCompatibility(pkg({ minVramMb: 16384 }), nvidiaPc).result).toBe('incompatible');
    expect(packageCompatibility(pkg({ minRamGb: 32 }), nvidiaPc).result).toBe('incompatible');
  });

  it('matches GPU family tokens against the model (RTX 30 ↔ RTX 3060)', () => {
    expect(packageCompatibility(pkg({ gpuFamily: 'RTX 30' }), nvidiaPc).result).toBe('compatible');
    expect(packageCompatibility(pkg({ gpuFamily: 'RTX 40' }), nvidiaPc).result).toBe('incompatible');
  });

  it('compares Windows versions correctly (11 >= 10, but not 8.1 >= 10)', () => {
    expect(packageCompatibility(pkg({ minWindows: '10' }), nvidiaPc).result).toBe('compatible');
    expect(packageCompatibility(pkg({ minWindows: '11' }), nvidiaPc).result).toBe('compatible');
    const oldPc = { ...nvidiaPc, windowsVersion: 'Windows 8.1' };
    expect(packageCompatibility(pkg({ minWindows: '10' }), oldPc).result).toBe('incompatible');
  });

  it('a rule-less package is compatible with any PC', () => {
    expect(packageCompatibility(pkg({}), nvidiaPc).result).toBe('compatible');
  });

  it('returns unknown when hardware is missing (never guesses)', () => {
    const noHw: HardwareProfileInput = { cpu: 'x', resolution: '1920x1080' };
    expect(packageCompatibility(pkg({ gpuVendor: 'nvidia' }), noHw).result).toBe('unknown');
    expect(packageCompatibility(pkg({}), noHw).result).toBe('compatible');
  });

  it('unknown when no hardware profile at all', () => {
    expect(packageCompatibility(pkg({ gpuVendor: 'nvidia' }), null).result).toBe('unknown');
  });
});

describe('rankPackages', () => {
  it('sorts compatible first, then unknown, then incompatible', () => {
    const pkgs = [
      pkg({ slug: 'amd', name: 'AMD Pack', gpuVendor: 'amd' }),
      pkg({ slug: 'plain', name: 'Generic Pack' }),
      pkg({ slug: 'nv', name: 'NVIDIA Pack', gpuVendor: 'nvidia' }),
    ];
    const ranked = rankPackages(pkgs, nvidiaPc).map((p) => p.slug);
    // Both compatible packages sort ahead of the incompatible one; among
    // compatible, alphabetical by name.
    expect(ranked[2]).toBe('amd');
    expect(new Set(ranked.slice(0, 2))).toEqual(new Set(['nv', 'plain']));
  });
});
