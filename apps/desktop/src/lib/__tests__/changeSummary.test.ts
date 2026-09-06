import { describe, expect, it } from 'vitest';
import { summarizeChanges, type Changeable } from '@/lib/changeSummary';

const t = (id: string, risk: Changeable['tweak']['risk'], extra: Partial<Changeable['tweak']> = {}): Changeable => ({
  tweak: { id, risk, ...extra },
});

const items = [
  t('a', 'low'),
  t('b', 'low', { requiresRestart: true }),
  t('c', 'medium', { requiresAdmin: true }),
  t('d', 'high', { requiresRestart: true, requiresAdmin: true }),
];

describe('the summary shown before anything is applied', () => {
  it('describes everything recommended when nothing is ticked', () => {
    // The button applies all recommendations on an empty selection, so a
    // summary reading "0 changes" would be a lie about what is about to happen.
    const s = summarizeChanges(items, []);
    expect(s.count).toBe(4);
    expect(s.needsRestart).toBe(2);
    expect(s.needsAdmin).toBe(2);
  });

  it('describes only what is ticked once something is', () => {
    const s = summarizeChanges(items, ['a', 'c']);
    expect(s.count).toBe(2);
    expect(s.risks).toEqual([
      { risk: 'low' as const, count: 1 },
      { risk: 'medium', count: 1 },
    ]);
    expect(s.needsRestart).toBe(0);
    expect(s.needsAdmin).toBe(1);
  });

  it('lists risks in severity order, and leaves out the ones with none', () => {
    const s = summarizeChanges(items, []);
    expect(s.risks.map((r) => r.risk)).toEqual(['low', 'medium', 'high']);
    expect(summarizeChanges(items, ['a', 'b']).risks).toEqual([{ risk: 'low' as const, count: 2 }]);
  });

  it('says when a batch is entirely safe, which is worth saying', () => {
    expect(summarizeChanges(items, ['a', 'b']).allSafe).toBe(true);
    expect(summarizeChanges(items, ['a', 'd']).allSafe).toBe(false);
  });

  it('is not "all safe" when there is nothing in it', () => {
    const s = summarizeChanges([], []);
    expect(s.count).toBe(0);
    expect(s.allSafe).toBe(false);
    expect(s.risks).toEqual([]);
  });

  it('ignores a selected id that is not on offer', () => {
    expect(summarizeChanges(items, ['a', 'nope']).count).toBe(1);
  });
});
