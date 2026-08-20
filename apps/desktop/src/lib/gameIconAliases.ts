/**
 * Catalog slug → bundled icon slug.
 *
 * The Optimized Setting import names games from its own source files, which
 * don't always match the brand pack's folder names for the same game. Rather
 * than renaming either side (the catalog slug is a public URL, and the icon
 * pack is supplied artwork), map the mismatches here.
 *
 * Hand-maintained: `gameIcons.ts` is regenerated from the PNGs on every
 * import, so aliases live in this file to survive that.
 */
export const ICON_ALIASES: Record<string, string> = {
  'doom-the-dark-ages': 'doomthedarkages',
  'horizon-forbidden-west': 'horizon-forbidden-west-complete-edition',
  'metro-exodus': 'metro-exodus-enhanced-edition',
  'spider-man-miles-morales': 'marvels-spiderman-miles-morales',
  'spider-man-remastered': 'marvels-spiderman-remastered',
  'uncharted-legacy-of-thieves': 'sony-uncharted-legacy-of-thieves-collection',
  // Remaster reuses the original's key art — better than a blank tile.
  'days-gone-remastered': 'days-gone',
  // Pack folders carry suffixes the catalog slug doesn't.
  'baldur-s-gate-3': 'baldurs-gate-3-no-sub',
  'dying-light-2': 'dying-light-2-stay-human',
  forspoken: 'forspoken-no-sub',
};
