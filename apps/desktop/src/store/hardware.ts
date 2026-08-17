import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HardwareProfileInput } from '@goh/types';
import { detectHardware } from '@/lib/hardware';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

export type HardwareStatus = 'idle' | 'detecting' | 'detected' | 'unsupported' | 'error';

interface HardwareState {
  status: HardwareStatus;
  profile: HardwareProfileInput | null;
  detectedAt: string | null;
  /** Run detection (Rust in the packaged app, fallback in the browser). */
  detect: () => Promise<void>;
  /** Push the snapshot to the server when signed in. */
  syncToServer: () => Promise<void>;
  clear: () => void;
}

export const useHardware = create<HardwareState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      profile: null,
      detectedAt: null,

      detect: async () => {
        set({ status: 'detecting' });
        try {
          const profile = await detectHardware();
          const hasData = Object.values(profile).some((v) => v !== undefined && v !== null);
          set({
            status: hasData ? 'detected' : 'unsupported',
            profile: hasData ? profile : null,
            detectedAt: hasData ? new Date().toISOString() : null,
          });
          if (hasData) await get().syncToServer();
        } catch {
          set({ status: 'error' });
        }
      },

      syncToServer: async () => {
        const { profile } = get();
        const user = useAuth.getState().user;
        if (!profile || !user) return;
        try {
          await api.saveHardware(profile);
        } catch {
          // offline / not critical — the local snapshot remains
        }
      },

      clear: () => set({ status: 'idle', profile: null, detectedAt: null }),
    }),
    {
      name: 'goh_hardware',
      partialize: (s) => ({ profile: s.profile, detectedAt: s.detectedAt, status: s.status }),
    },
  ),
);
