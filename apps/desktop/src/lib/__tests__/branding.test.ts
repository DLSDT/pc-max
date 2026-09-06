import { describe, expect, it } from 'vitest';
import { forDarkTheme, hexToHslTriplet } from '@/lib/branding';

describe('a brand colour on the dark theme', () => {
  it('lifts a colour too dark to see against a near-black background', () => {
    // Burgundy is the case that forced this. #6E1226 is 25% light: correct on
    // off-white, and on #131110 it is a shape rather than a colour.
    const burgundy = hexToHslTriplet('#6E1226')!;
    expect(burgundy).toBe('347 72% 25%');
    expect(forDarkTheme(burgundy)).toBe('347 72% 36%');
  });

  it('keeps hue and saturation, so it is still the same colour', () => {
    const [h, s] = forDarkTheme('347 72% 12%').split(' ');
    expect(h).toBe('347');
    expect(s).toBe('72%');
  });

  it('leaves a colour that is already light enough alone', () => {
    expect(forDarkTheme('357 92% 47%')).toBe('357 92% 47%');
    expect(forDarkTheme('347 72% 36%')).toBe('347 72% 36%');
  });

  it('passes anything it cannot parse straight through', () => {
    expect(forDarkTheme('not a triplet')).toBe('not a triplet');
  });
});
