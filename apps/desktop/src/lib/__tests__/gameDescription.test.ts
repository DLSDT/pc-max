/**
 * A catalogue is filled one language at a time, so the interesting cases are
 * the half-filled ones: a Persian reader must get the English paragraph rather
 * than a blank space, and vice versa.
 */
import { describe, expect, it } from 'vitest';
import { gameDescription } from '../labels';

describe('gameDescription', () => {
  it('prefers the language being read', () => {
    const g = { descriptionFa: 'شرح فارسی', descriptionEn: 'English text' };
    expect(gameDescription(g, 'fa')).toBe('شرح فارسی');
    expect(gameDescription(g, 'en')).toBe('English text');
  });

  it('falls back to the other language rather than to nothing', () => {
    expect(gameDescription({ descriptionEn: 'only english' }, 'fa')).toBe('only english');
    expect(gameDescription({ descriptionFa: 'فقط فارسی' }, 'en')).toBe('فقط فارسی');
  });

  it('still reads the pre-split column on older rows', () => {
    expect(gameDescription({ description: 'legacy' }, 'fa')).toBe('legacy');
  });

  it('treats whitespace as absent, so a blank row does not win over a filled one', () => {
    expect(gameDescription({ descriptionFa: '   ', descriptionEn: 'real' }, 'fa')).toBe('real');
  });

  it('returns null when there is nothing to show', () => {
    expect(gameDescription({}, 'fa')).toBeNull();
  });
});
