import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICON_ALIASES } from '../gameIconAliases';
import { gameIconUrl } from '../gameIcons';

/**
 * The alias map points catalog slugs at bundled icon files. A typo, or an icon
 * being renamed/removed from the pack, would silently turn back into a blank
 * tile — exactly the bug these aliases were added to fix. Assert every alias
 * still resolves to a PNG that is actually on disk.
 */
const ICON_DIR = path.resolve(__dirname, '../../../public/game-icons');

describe('game icon aliases', () => {
  const files = new Set(readdirSync(ICON_DIR).filter((f) => f.endsWith('.webp')));

  it('every alias target exists in the icon pack', () => {
    const broken = Object.entries(ICON_ALIASES).filter(([, target]) => !files.has(`${target}.webp`));
    expect(broken, `aliases pointing at missing icons: ${JSON.stringify(broken)}`).toEqual([]);
  });

  it('resolves aliased slugs to a real bundled file', () => {
    for (const [slug, target] of Object.entries(ICON_ALIASES)) {
      expect(gameIconUrl(slug), `alias ${slug}`).toBe(`/game-icons/${target}.webp`);
    }
  });

  it('still resolves non-aliased slugs directly, and unknown ones to null', () => {
    expect(gameIconUrl('control')).toBe('/game-icons/control.webp');
    expect(gameIconUrl('definitely-not-a-real-game')).toBeNull();
  });

  it('never aliases a slug that already has its own icon', () => {
    const redundant = Object.keys(ICON_ALIASES).filter((slug) => files.has(`${slug}.webp`));
    expect(redundant, `these slugs need no alias: ${redundant.join(', ')}`).toEqual([]);
  });
});
