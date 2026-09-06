import { describe, expect, it } from 'vitest';
import { moveCursor, searchCommands, type CommandItem } from '@/lib/commandSearch';

const items: CommandItem[] = [
  { id: 'p1', label: 'داشبورد', to: '/', kind: 'page' },
  { id: 'p2', label: 'بهینه‌ساز ویندوز', to: '/windows-optimizer', kind: 'page' },
  { id: 'p3', label: 'بازی‌ها', to: '/games', kind: 'page' },
  { id: 'g1', label: 'Cyberpunk 2077', hint: 'Night City', to: '/games/cyberpunk-2077', kind: 'game', keywords: 'cyberpunk-2077' },
  { id: 'g2', label: 'Elden Ring', hint: 'A cyclical world', to: '/games/elden-ring', kind: 'game', keywords: 'elden-ring' },
  { id: 'g3', label: 'Cities: Skylines II', to: '/games/cities-skylines-ii', kind: 'game', keywords: 'cities-skylines-ii' },
];

describe('the command palette search', () => {
  it('opens on the pages, not on three hundred game titles', () => {
    const empty = searchCommands(items, '');
    expect(empty.map((i) => i.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('puts a prefix match above the same letters buried in a tagline', () => {
    // "cy" is the start of Cyberpunk and the middle of "cyclical". A palette
    // that answers with Elden Ring first is one people stop using.
    const [first] = searchCommands(items, 'cy');
    expect(first!.id).toBe('g1');
  });

  it('finds a word inside the title', () => {
    expect(searchCommands(items, 'punk').map((i) => i.id)).toEqual(['g1']);
  });

  it('matches the slug, which is what people paste', () => {
    expect(searchCommands(items, 'elden-ring').map((i) => i.id)).toEqual(['g2']);
  });

  it('finds a Latin title while the interface is in Persian', () => {
    expect(searchCommands(items, 'ELDEN').map((i) => i.id)).toEqual(['g2']);
  });

  it('finds Persian text typed with an Arabic keyboard', () => {
    // The Arabic yeh and kaf are different code points from the Persian ones,
    // and a keyboard will hand you either. Unfolded, this returns nothing.
    expect(searchCommands(items, 'بازي‌ها').map((i) => i.id)).toEqual(['p3']);
    expect(searchCommands(items, 'بهينه').map((i) => i.id)).toEqual(['p2']);
  });

  it('treats a zero-width non-joiner as a space, because typing one is optional', () => {
    expect(searchCommands(items, 'بهینه ساز').map((i) => i.id)).toEqual(['p2']);
  });

  it('reads Persian digits as digits', () => {
    expect(searchCommands(items, '۲۰۷۷').map((i) => i.id)).toEqual(['g1']);
  });

  it('returns nothing for a query nothing matches', () => {
    expect(searchCommands(items, 'zzzz')).toEqual([]);
  });

  it('honours the limit', () => {
    expect(searchCommands(items, 'e', 2)).toHaveLength(2);
  });
});

describe('moving through the results', () => {
  it('wraps off the end and off the start', () => {
    expect(moveCursor(2, 1, 3)).toBe(0);
    expect(moveCursor(0, -1, 3)).toBe(2);
  });

  it('stays put when there is nothing to move through', () => {
    expect(moveCursor(0, 1, 0)).toBe(0);
  });
});
