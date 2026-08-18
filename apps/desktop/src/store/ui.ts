import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Connectivity truth model — an API failure is NOT automatically "offline":
 *  - online           — the PC MAX service answered
 *  - offline          — no internet connectivity
 *  - api-unavailable  — internet works but the PC MAX service is unreachable
 *  - syncing / idle   — transitional states
 */
export type SyncStatus = 'idle' | 'syncing' | 'online' | 'offline' | 'api-unavailable';

interface GamesFilters {
  q: string;
  genre: string;
  year: string;
  techs: string[];
}

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  language: 'en' | 'fa';
  setLanguage: (lng: 'en' | 'fa') => void;

  syncStatus: SyncStatus;
  setSyncStatus: (s: SyncStatus) => void;

  filters: GamesFilters;
  setFilters: (f: Partial<GamesFilters>) => void;
  resetFilters: () => void;

  updateAvailable: boolean;
  setUpdateAvailable: (v: boolean) => void;

  /** Running version is below the server-mandated minimum (blocking banner). */
  updateRequired: boolean;
  setUpdateRequired: (v: boolean) => void;
}

const EMPTY_FILTERS: GamesFilters = { q: '', genre: '', year: '', techs: [] };

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      language: 'en',
      setLanguage: (language) => set({ language }),

      syncStatus: 'idle',
      setSyncStatus: (syncStatus) => set({ syncStatus }),

      filters: EMPTY_FILTERS,
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
      resetFilters: () => set({ filters: EMPTY_FILTERS }),

      updateAvailable: false,
      setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),

      updateRequired: false,
      setUpdateRequired: (updateRequired) => set({ updateRequired }),
    }),
    {
      name: 'goh_ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, language: s.language }),
    },
  ),
);
