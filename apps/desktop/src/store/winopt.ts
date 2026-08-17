import { create } from 'zustand';
import {
  windowsScan,
  windowsApply,
  windowsRestore,
  windowsSnapshots,
  windowsRecover,
  type ApplyResult,
  type RecoveryReport,
  type ScanResult,
  type SnapshotMeta,
  type TweakStatus,
  RISK_ORDER,
  CATEGORY_ORDER,
} from '@/lib/winopt';

export type WinStatus = 'idle' | 'scanning' | 'ready' | 'unsupported' | 'applying' | 'error';

export interface Recommendation {
  tweak: TweakStatus;
  impact: 'high' | 'medium' | 'low';
  reason: string;
}

interface WinOptState {
  status: WinStatus;
  scan: ScanResult | null;
  snapshots: SnapshotMeta[];
  lastApply: ApplyResult | null;
  recovery: RecoveryReport | null;
  error: string | null;
  /** Actions */
  scanSystem: () => Promise<void>;
  refreshSnapshots: () => Promise<void>;
  apply: (profile: string, tweakIds: string[]) => Promise<ApplyResult | null>;
  restore: (id: string) => Promise<number>;
  recover: () => Promise<void>;
  reset: () => void;
}

/** Real score from actual optimization state — never fabricated. */
export function computeScore(scan: ScanResult | null): { score: number; label: 'excellent' | 'good' | 'fair' | 'attention' } | null {
  if (!scan || !scan.supported) return null;
  const recommended = scan.tweaks.filter((t) => t.supported && !t.applied);
  const applied = scan.tweaks.filter((t) => t.supported && t.applied);
  if (recommended.length === 0) return { score: 95, label: 'excellent' };
  const ratio = applied.length / Math.max(1, recommended.length + applied.length);
  const score = Math.round(45 + ratio * 50);
  const label = score >= 85 ? 'excellent' : score >= 65 ? 'good' : score >= 45 ? 'fair' : 'attention';
  return { score, label };
}

/** Ordered recommendations grouped by impact for the Smart Optimize view. */
export function recommend(scan: ScanResult | null): Recommendation[] {
  if (!scan || !scan.supported) return [];
  return scan.tweaks
    .filter((t) => t.supported && !t.applied)
    .map((t) => ({
      tweak: t,
      impact: (t.risk === 'low' ? 'low' : t.risk === 'medium' ? 'medium' : 'high') as Recommendation['impact'],
      reason: t.reason || 'Improves this area of the system.',
    }))
    .sort((a, b) => RISK_ORDER[a.tweak.risk] - RISK_ORDER[b.tweak.risk] || CATEGORY_ORDER[a.tweak.category] - CATEGORY_ORDER[b.tweak.category]);
}

export const useWinOpt = create<WinOptState>()((set, get) => ({
  status: 'idle',
  scan: null,
  snapshots: [],
  lastApply: null,
  recovery: null,
  error: null,

  scanSystem: async () => {
    set({ status: 'scanning', error: null });
    const scan = await windowsScan();
    set({ scan, status: scan.supported ? 'ready' : 'unsupported' });
    await get().refreshSnapshots();
  },

  refreshSnapshots: async () => {
    const snapshots = await windowsSnapshots();
    set({ snapshots });
  },

  apply: async (profile, tweakIds) => {
    set({ status: 'applying', error: null });
    try {
      const result = await windowsApply(profile, tweakIds);
      set({ lastApply: result, error: result.error });
      await get().scanSystem();
      return result;
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Apply failed.' });
      return null;
    }
  },

  restore: async (id) => {
    const n = await windowsRestore(id);
    await get().scanSystem();
    return n;
  },

  recover: async () => {
    const recovery = await windowsRecover();
    set({ recovery });
  },

  reset: () => set({ status: 'idle', scan: null, lastApply: null, error: null }),
}));
