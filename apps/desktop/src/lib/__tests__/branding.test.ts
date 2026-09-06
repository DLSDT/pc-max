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
    // and on #131110 it is a shape rather than a colour — 2.4:1.
    const burgundy = hexToHslTriplet('#6E1226')!;
    expect(burgundy).toBe('347 72% 25%');
    expect(forDarkTheme(burgundy)).toBe('347 50% 46%');
  });

  it('damps saturation as it lifts, or the result is a brighter colour', () => {
    // Lightness alone takes burgundy to #CA2145, a bright crimson — the exact
    // thing the palette was chosen to get away from.
    const [, s] = forDarkTheme('347 72% 25%').split(' ');
    expect(s).toBe('50%');
  });

  it('never changes the hue', () => {
    for (const t of ['347 72% 25%', '145 70% 12%', '205 85% 30%']) {
      expect(forDarkTheme(t).split(' ')[0]).toBe(t.split(' ')[0]);
    }
  });

  it('leaves a colour that is already light enough exactly as it is', () => {
    expect(forDarkTheme('357 92% 47%')).toBe('357 92% 47%');
    expect(forDarkTheme('347 48% 46%')).toBe('347 48% 46%');
  });

  it('passes anything it cannot parse straight through', () => {
    expect(forDarkTheme('not a triplet')).toBe('not a triplet');
  });
});
