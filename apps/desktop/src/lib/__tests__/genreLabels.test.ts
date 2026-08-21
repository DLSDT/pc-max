import { describe, expect, it } from 'vitest';
import { genreDescription, genreName } from '../genreLabels';
// Imported straight from the API's source: these labels exist only to cover
// what that table can send, so the two must break together.
import { BROWSE_CATEGORIES } from '../../../../api/src/db/seed-data';

const SLUGS = BROWSE_CATEGORIES.map((c) => c.slug);

describe('genre labels', () => {
  it('translates every category the server can send', () => {
    // Adding a category server-side without a Persian label degrades silently
    // to English in an otherwise fully-Persian RTL UI, which is exactly the
    // bug this map was added to fix.
    const untranslated = SLUGS.filter((slug) => genreName(slug, '@@fallback', 'fa') === '@@fallback');
    expect(untranslated).toEqual([]);
  });

  it('describes every category too', () => {
    const undescribed = SLUGS.filter((slug) => genreDescription(slug, '@@fallback', 'fa') === '@@fallback');
    expect(undescribed).toEqual([]);
  });

  it('falls back to the server name for an unknown slug', () => {
    expect(genreName('roguelike', 'Roguelike', 'fa')).toBe('Roguelike');
    expect(genreDescription('roguelike', 'Run-based', 'fa')).toBe('Run-based');
    expect(genreDescription('roguelike', null, 'fa')).toBeNull();
  });

  it('leaves English alone', () => {
    expect(genreName('action', 'Action', 'en')).toBe('Action');
    expect(genreDescription('action', 'Fast-paced', 'en')).toBe('Fast-paced');
  });
});
