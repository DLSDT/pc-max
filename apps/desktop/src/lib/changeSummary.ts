/**
 * What a click on "optimize" is about to do, in numbers.
 *
 * Every survey of what people want from a tool that edits their system says
 * the same thing first: show exactly what will change *before* it changes, and
 * make the way back obvious. PC MAX already takes a snapshot and can restore
 * it — that was never the gap. The gap was that the button applied twenty-odd
 * changes to Windows with no statement of what they were or that they could be
 * undone, which is indistinguishable from the tools people have learned not to
 * trust.
 */

import type { Risk } from '@/lib/winopt';

export interface Changeable {
  tweak: {
    id: string;
    risk: Risk;
    requiresRestart?: boolean;
    requiresAdmin?: boolean;
  };
}

export interface ChangeSummary {
  count: number;
  /** Only the risks actually present, in ascending severity — an empty count
   *  listed as "0 advanced" is noise, and severity order is what people scan. */
  risks: { risk: Risk; count: number }[];
  needsRestart: number;
  needsAdmin: number;
  /** True when nothing beyond the lowest risk tier is included. */
  allSafe: boolean;
}

/** Ascending severity — the order people scan a risk breakdown in. */
const ORDER: Risk[] = ['low', 'medium', 'high', 'experimental'];

export function summarizeChanges<T extends Changeable>(items: T[], selectedIds: string[]): ChangeSummary {
  // An empty selection means "everything recommended", which is what the
  // button does — so the summary has to describe that, not zero changes.
  const chosen = selectedIds.length ? items.filter((i) => selectedIds.includes(i.tweak.id)) : items;

  const counts = new Map<string, number>();
  let needsRestart = 0;
  let needsAdmin = 0;
  for (const i of chosen) {
    counts.set(i.tweak.risk, (counts.get(i.tweak.risk) ?? 0) + 1);
    if (i.tweak.requiresRestart) needsRestart += 1;
    if (i.tweak.requiresAdmin) needsAdmin += 1;
  }

  const risks = ORDER.filter((r) => counts.get(r)).map((risk) => ({ risk, count: counts.get(risk)! }));

  return {
    count: chosen.length,
    risks,
    needsRestart,
    needsAdmin,
    allSafe: chosen.length > 0 && risks.every((r) => r.risk === 'low'),
  };
}
