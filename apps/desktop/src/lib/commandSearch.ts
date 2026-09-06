/**
 * Ranking for the command palette.
 *
 * Separate from the component because the interesting part is not the popup,
 * it is what comes back when someone types three letters — and that is a pure
 * function of the query and the list.
 *
 * Two properties matter more than cleverness here. A game the user is looking
 * at right now must be findable by its Latin name while the interface is in
 * Persian, and a prefix match must beat a match buried in the middle of a
 * word: typing "cy" should surface Cyberpunk, not every game with "cy"
 * somewhere in its subtitle.
 */

export interface CommandItem {
  id: string;
  /** What is shown, in the user's language. */
  label: string;
  /** Optional second line — a game's tagline, a page's purpose. */
  hint?: string;
  /** Where it goes. */
  to: string;
  kind: 'page' | 'game' | 'action';
  /** Extra text to match on that is not displayed — a game's slug, say. */
  keywords?: string;
}

/**
 * Persian and Arabic type the same letters with different code points, and a
 * keyboard will give you either. Without folding them, a user who types the
 * Arabic yeh finds nothing in a catalogue stored with the Persian one.
 */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[يى]/g, 'ی') // Arabic yeh / alef maksura → Persian yeh
    .replace(/[ك]/g, 'ک') // Arabic kaf → Persian kaf
    .replace(/[أإآ]/g, 'ا') // hamzated alefs → plain alef
    .replace(/[ً-ٰٟ]/g, '') // harakat
    .replace(/‌/g, ' ') // ZWNJ reads as a word break
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // Persian digits
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic digits
    .replace(/\s+/g, ' ')
    .trim();
}

/** Score one item against a folded query. Higher is better; 0 means no match. */
function score(item: CommandItem, q: string): number {
  const label = fold(item.label);
  const hay = fold([item.label, item.hint, item.keywords].filter(Boolean).join(' '));
  if (!hay.includes(q)) return 0;

  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  // A word inside the label — "punk" finding "Cyberpunk 2077" is worth more
  // than the same letters appearing in a tagline.
  if (label.split(' ').some((w) => w.startsWith(q))) return 60;
  if (label.includes(q)) return 40;
  return 20;
}

/**
 * The visible results, best first.
 *
 * With no query this is the pages alone: a palette that opens onto three
 * hundred game titles has answered a question nobody asked, and the pages are
 * what someone reaching for Ctrl+K nine times out of ten wants.
 */
export function searchCommands(items: CommandItem[], query: string, limit = 12): CommandItem[] {
  const q = fold(query);
  if (!q) return items.filter((i) => i.kind !== 'game').slice(0, limit);

  return items
    .map((item, index) => ({ item, index, s: score(item, q) }))
    .filter((r) => r.s > 0)
    // Ties keep the order they were given in, so pages stay above games and
    // the catalogue keeps whatever order it arrived in.
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item);
}

/** Move through a list of `count` items, wrapping at both ends. */
export function moveCursor(current: number, delta: number, count: number): number {
  if (count === 0) return 0;
  return (current + delta + count) % count;
}
