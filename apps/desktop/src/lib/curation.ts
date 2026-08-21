import type { GameSummary } from '@goh/types';

/**
 * Whether a game carries real editorial metadata, as opposed to being a shell
 * auto-created by the Optimized Setting importer.
 *
 * Imported games arrive with a name and nothing else — every editorial field
 * is null and `performanceRating` is left at its placeholder of 50. Showing
 * that 50 as "Performance rating: 50/100" presents a fabricated number as a
 * real score, so the rating is hidden until a game is actually curated.
 *
 * This deliberately does NOT look at genres. Genres are assigned in bulk by
 * apply-catalog-metadata for the whole catalogue, so using them as the signal
 * would mark all 300+ imported shells as curated and surface exactly the fake
 * rating this check exists to hide.
 */
export function hasCuratedMetadata(game: Pick<GameSummary, 'tagline' | 'releaseYear' | 'engine'> | null | undefined): boolean {
  if (!game) return false;
  return Boolean(game.tagline || game.releaseYear !== null || game.engine);
}
