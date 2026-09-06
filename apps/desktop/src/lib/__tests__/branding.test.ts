import { describe, expect, it } from 'vitest';
import { forDarkTheme, hexToHslTriplet } from '@/lib/branding';

/**
 * A brand colour is applied over the stylesheet at runtime, and an inline
 * custom property on `:root` beats any rule — so whatever this returns is what
 * the dark theme gets, with no chance for CSS to correct it.
 */
describe('a brand colour on the dark theme', () => {
  it('lifts a colour too dark to see against a near-black background', () => {
    // The case that forced this. #6E1226 is 25% light: correct on off-white,
    // and on #0F0F0F it is a shape rather than a colour — 2.4:1.
    const burgundy = hexToHslTriplet('#6E1226')!;
    expect(burgundy).toBe('347 72% 25%');
    expect(forDarkTheme(burgundy)).toBe('347 72% 43%');
  });

  it('keeps the saturation, because dropping it is what makes a red pink', () => {
    // Lifting lightness while damping saturation produced #B03B54 — light and
    // washed out is the definition of pink, and it was rejected on sight.
    const [, s] = forDarkTheme('347 72% 25%').split(' ');
    expect(s).toBe('72%');
  });

  it('never changes the hue', () => {
    for (const t of ['347 72% 25%', '145 70% 12%', '205 85% 30%']) {
      expect(forDarkTheme(t).split(' ')[0]).toBe(t.split(' ')[0]);
    }
  });

  it('leaves a colour that is already light enough exactly as it is', () => {
    expect(forDarkTheme('357 92% 47%')).toBe('357 92% 47%');
    expect(forDarkTheme('348 74% 43%')).toBe('348 74% 43%');
  });

  it('passes anything it cannot parse straight through', () => {
    expect(forDarkTheme('not a triplet')).toBe('not a triplet');
  });
});
