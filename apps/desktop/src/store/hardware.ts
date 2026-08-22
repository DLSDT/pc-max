import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HardwareProfileInput } from '@goh/types';
import { detectHardware, type HardwareSource } from '@/lib/hardware';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

export type HardwareStatus = 'idle' | 'detecting' | 'detected' | 'unsupported' | 'error';

/** A detection older than this is refreshed on the next ensure(); hardware
 *  does not change often, and WMI queries are slow enough to be worth caching. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

interface HardwareState {
  status: HardwareStatus;
  profile: HardwareProfileInput | null;
  detectedAt: string | null;
  /** Where the current profile came from — 'browser' is preview-only, not real. */
  source: HardwareSource | null;
  /** Why detection failed, for the error state. Cleared on success. */
  error: string | null;
  /** Force a fresh detection (the Refresh button). */
  detect: () => Promise<void>;
  /** Detect only if nothing usable is cached — safe to call on every mount. */
  ensure: () => Promise<void>;
  syncToServer: () => Promise<void>;
  clear: () => void;
}

/** True when the snapshot has at least one real field in it. */
function hasData(profile: HardwareProfileInput): boolean {
  return Object.values(profile).some((v) => v !== undefined && v !== null && v !== '');
}

export const useHardware = create<HardwareState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      profile: null,
      detectedAt: null,
      source: null,
      error: null,

      detect: async () => {
        if (get().status === 'detecting') return; // never run two WMI sweeps at once
        set({ status: 'detecting', error: null });
        try {
          const { profile, source } = await detectHardware();
          if (!hasData(profile)) {
            set({ status: 'unsupported', profile: null, detectedAt: null, source, error: null });
            return;
          }
          set({
            status: 'detected',
            profile,
            source,
            detectedAt: new Date().toISOString(),
            error: null,
          });
          await get().syncToServer();
        } catch (err) {
          // Keep whatever was detected before rather than blanking the panel —
          // stale real hardware beats an empty one, and the UI shows the error.
          set({
            status: 'error',
            error: err instanceof Error ? err.message : 'Hardware detection failed',
          });
        }
      },

      ensure: async () => {
        const { status, profile, detectedAt } = get();
        if (status === 'detecting') return;
        const fresh =
          profile !== null && detectedAt !== null && Date.now() - Date.parse(detectedAt) < STALE_AFTER_MS;
        if (fresh) return;
        await get().detect();
      },

      syncToServer: async () => {
        const { profile, source } = get();
        const user = useAuth.getState().user;
        // Only real detections are worth storing against the account; the
        // browser preview's screen size is not this user's hardware.
        if (!profile || !user || source !== 'native') return;
        try {
          await api.saveHardware(profile);
        } catch {
          // offline / not critical — the local snapshot remains
        }
      },

      clear: () => set({ status: 'idle', profile: null, detectedAt: null, source: null, error: null }),
    }),
    {
      name: 'goh_hardware',
      partialize: (s) => ({
        profile: s.profile,
        detectedAt: s.detectedAt,
        status: s.status,
        source: s.source,
      }),
      // A persisted 'detecting' would strand the UI in a spinner forever if the
      // app closed mid-detection.
      onRehydrateStorage: () => (state) => {
        if (state && (state.status === 'detecting' || state.status === 'error')) {
          state.status = state.profile ? 'detected' : 'idle';
        }
      },
    },
  ),
);
