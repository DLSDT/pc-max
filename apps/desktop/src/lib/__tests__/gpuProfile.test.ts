/**
 * GPU → OptiScaler profile matching.
 *
 * The failure this guards against is installing an AMD frame-generation config
 * on an NVIDIA card (or the reverse), which the user only discovers as a
 * broken or crashing game. Every case below uses profile names from the real
 * package and GPU strings in the shape Windows WMI actually returns.
 */
import { describe, expect, it } from 'vitest';
import {
  isVendorMismatch,
  normalizeVendor,
  profileVendor,
  recommendProfile,
  supportsOpticalFlow,
} from '../gpuProfile';

const PROFILES = ['NVIDIA P1-6X', 'NVIDIA P2-6X', 'AMD P1-6X', 'AMD P2-6X', 'XESS P1-2X', 'XESS P2-2X'];

describe('profileVendor', () => {
  it('reads the vendor out of the real profile names', () => {
    expect(PROFILES.map(profileVendor)).toEqual(['nvidia', 'nvidia', 'amd', 'amd', 'intel', 'intel']);
  });

  it('returns null for a name that targets nobody', () => {
    // An admin may publish profiles named anything; guessing would be worse
    // than admitting we do not know.
    expect(profileVendor('Balanced')).toBeNull();
    expect(profileVendor('P1-6X')).toBeNull();
  });
});

describe('normalizeVendor', () => {
  it('classifies real WMI adapter strings', () => {
    const cases: [string, string | null][] = [
      ['NVIDIA GeForce RTX 4070 Laptop GPU', 'nvidia'],
      ['NVIDIA GeForce GTX 1660 Ti', 'nvidia'],
      ['AMD Radeon RX 7900 XTX', 'amd'],
      ['Intel(R) Arc(TM) A770 Graphics', 'intel'],
      ['Intel(R) UHD Graphics 630', 'intel'],
      ['Microsoft Basic Display Adapter', null],
    ];
    for (const [model, expected] of cases) {
      expect(normalizeVendor({ gpuModel: model }), model).toBe(expected);
    }
  });

  it('is null when nothing was detected', () => {
    // Browser preview reports no GPU at all — that must not become a guess.
    expect(normalizeVendor(null)).toBeNull();
    expect(normalizeVendor({})).toBeNull();
  });
});

describe('recommendProfile', () => {
  it('picks the first profile matching the detected vendor', () => {
    expect(recommendProfile(PROFILES, 'nvidia')).toBe('NVIDIA P1-6X');
    expect(recommendProfile(PROFILES, 'amd')).toBe('AMD P1-6X');
    expect(recommendProfile(PROFILES, 'intel')).toBe('XESS P1-2X');
  });

  it('never recommends across vendors', () => {
    // The whole point: an NVIDIA machine offered only AMD profiles gets no
    // recommendation rather than a wrong one.
    expect(recommendProfile(['AMD P1-6X', 'AMD P2-6X'], 'nvidia')).toBeNull();
    expect(recommendProfile(['NVIDIA P1-6X'], 'amd')).toBeNull();
  });

  it('recommends nothing when the GPU is unknown', () => {
    expect(recommendProfile(PROFILES, null)).toBeNull();
  });

  it('recommends nothing when the package has no profiles', () => {
    expect(recommendProfile([], 'nvidia')).toBeNull();
  });
});

describe('isVendorMismatch', () => {
  it('flags a cross-vendor choice', () => {
    expect(isVendorMismatch('AMD P1-6X', 'nvidia')).toBe(true);
    expect(isVendorMismatch('NVIDIA P2-6X', 'amd')).toBe(true);
  });

  it('stays quiet when the choice matches, is unknown, or the GPU is unknown', () => {
    expect(isVendorMismatch('NVIDIA P1-6X', 'nvidia')).toBe(false);
    expect(isVendorMismatch('Balanced', 'nvidia')).toBe(false);
    expect(isVendorMismatch('AMD P1-6X', null)).toBe(false);
    expect(isVendorMismatch(null, 'nvidia')).toBe(false);
  });
});

describe('supportsOpticalFlow', () => {
  it('accepts RTX 20 through 50 series', () => {
    for (const m of ['NVIDIA GeForce RTX 2060', 'GeForce RTX 3080 Ti', 'NVIDIA GeForce RTX 4090', 'NVIDIA GeForce RTX 5080']) {
      expect(supportsOpticalFlow({ gpuModel: m }), m).toBe(true);
    }
  });

  it('rejects a GTX card even though it is NVIDIA', () => {
    // Vendor alone is not the requirement — the Optical Flow engine is RTX-only.
    expect(supportsOpticalFlow({ gpuModel: 'NVIDIA GeForce GTX 1080 Ti' })).toBe(false);
  });

  it('rejects other vendors', () => {
    expect(supportsOpticalFlow({ gpuModel: 'AMD Radeon RX 7900 XTX' })).toBe(false);
    expect(supportsOpticalFlow({ gpuModel: 'Intel(R) Arc(TM) A770 Graphics' })).toBe(false);
  });

  it('says "unknown" rather than guessing when there is no detection', () => {
    expect(supportsOpticalFlow(null)).toBeNull();
    expect(supportsOpticalFlow({})).toBeNull();
    expect(supportsOpticalFlow({ gpuVendor: 'nvidia' })).toBeNull();
  });
});
