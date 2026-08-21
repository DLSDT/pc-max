import { describe, expect, it } from 'vitest';
import { hasCuratedMetadata } from '../curation';

const shell = { tagline: null, releaseYear: null, engine: null };

describe('hasCuratedMetadata', () => {
  it('rejects the shells the Optimized Setting importer creates', () => {
    // Every one of the 300+ imported games looks exactly like this, and each
    // carries performanceRating 50 — a placeholder, not a score.
    expect(hasCuratedMetadata(shell)).toBe(false);
    expect(hasCuratedMetadata(null)).toBe(false);
    expect(hasCuratedMetadata(undefined)).toBe(false);
  });

  it('accepts a game with any real editorial field', () => {
    expect(hasCuratedMetadata({ ...shell, tagline: 'Wake up, samurai' })).toBe(true);
    expect(hasCuratedMetadata({ ...shell, releaseYear: 2020 })).toBe(true);
    expect(hasCuratedMetadata({ ...shell, engine: 'RED Engine 4' })).toBe(true);
  });

  it('does not treat a bulk-assigned genre as curation', () => {
    // The previous implementation used `genres.length > 0`. Genres are applied
    // to the entire catalogue at once, so that flipped every imported shell to
    // "curated" and put the fake 50 rating back on screen.
    expect(hasCuratedMetadata({ ...shell, genres: [{ slug: 'action', name: 'Action' }] } as never)).toBe(false);
  });

  it('counts release year zero as present, not missing', () => {
    // `Boolean(0)` is false — a naive truthiness check would drop it.
    expect(hasCuratedMetadata({ ...shell, releaseYear: 0 })).toBe(true);
  });
});
