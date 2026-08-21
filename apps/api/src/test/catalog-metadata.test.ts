import { describe, expect, it } from 'vitest';
import { GAME_GENRES } from '../db/catalog-metadata';
import { BROWSE_CATEGORIES } from '../db/seed-data';

const KNOWN = new Set<string>(BROWSE_CATEGORIES.map((c) => c.slug));

describe('GAME_GENRES', () => {
  it('only references categories that ensureTaxonomy creates', () => {
    // A typo here silently drops the genre: assign-genres cannot resolve the
    // slug to an id, so the game quietly loses that filter. Catch it at build
    // time instead of finding an empty filter option in production.
    const unknown = new Set<string>();
    for (const genres of Object.values(GAME_GENRES)) {
      for (const g of genres) if (!KNOWN.has(g)) unknown.add(g);
    }
    expect([...unknown]).toEqual([]);
  });

  it('gives every game at least one genre, with no duplicates', () => {
    const empty: string[] = [];
    const dupes: string[] = [];
    for (const [slug, genres] of Object.entries(GAME_GENRES)) {
      if (genres.length === 0) empty.push(slug);
      if (new Set(genres).size !== genres.length) dupes.push(slug);
    }
    expect(empty).toEqual([]);
    expect(dupes).toEqual([]);
  });

  it('keeps every category reachable — no filter option that matches nothing', () => {
    const used = new Set(Object.values(GAME_GENRES).flat());
    const orphaned = [...KNOWN].filter((c) => !used.has(c));
    expect(orphaned).toEqual([]);
  });
});

describe('FEATURED_GAMES', () => {
  it('only features games that have curated genres, with no duplicates', async () => {
    const { FEATURED_GAMES } = await import('../db/catalog-metadata');
    // A featured slug that is not in GAME_GENRES is almost certainly a typo:
    // both tables are keyed on games.slug, so one cannot be right if the
    // other has no entry for it.
    const unknown = FEATURED_GAMES.filter((s) => !(s in GAME_GENRES));
    expect(unknown).toEqual([]);
    expect(new Set(FEATURED_GAMES).size).toBe(FEATURED_GAMES.length);
    expect(FEATURED_GAMES.length).toBeGreaterThan(0);
  });
});
