import type { GameDetail, GameSummary, HomeResponse, OptimizationProfile } from '@goh/types';

/**
 * CacheStore — offline-first persistence for the desktop app.
 *
 * Backed by localStorage (JSON) so the app works in the Tauri webview AND in a
 * plain browser during development. The interface keeps a future SQLite-backed
 * implementation (tauri-plugin-sql) a drop-in replacement.
 */
export interface CacheStore {
  load(): void;
  save(): void;

  /** Subscribe to any cache mutation (used to re-render favorites etc.). */
  subscribe(listener: () => void): () => void;

  /** Wipe everything (settings → clear cache). Device re-registers on next sync. */
  clear(): void;

  getHome(): HomeResponse | null;
  setHome(home: HomeResponse): void;

  getGames(): GameSummary[];
  setGames(games: GameSummary[]): void;
  upsertGames(games: GameSummary[]): void;
  removeGame(slug: string): void;

  getGame(slug: string): GameDetail | null;
  setGame(game: GameDetail): void;

  getProfiles(gameSlug: string): OptimizationProfile[] | null;
  setProfiles(gameSlug: string, profiles: OptimizationProfile[]): void;

  /** Server-side profile versions keyed by game slug (for "new optimization" badges). */
  getProfileVersions(gameSlug: string): Record<string, string>;
  setProfileVersions(gameSlug: string, versions: Record<string, string>): void;

  getFavorites(): GameSummary[];
  isFavorite(gameId: string): boolean;
  addFavorite(game: GameSummary): void;
  removeFavorite(gameId: string): void;

  getRecent(): GameDetail[];
  addRecent(game: GameDetail): void;

  getLastSync(): string | null;
  setLastSync(ts: string | null): void;

  getDeviceId(): string;
  setDeviceId(id: string): void;
}

interface CacheShape {
  home: HomeResponse | null;
  games: Record<string, GameSummary>;
  gamesOrder: string[];
  details: Record<string, GameDetail>;
  profiles: Record<string, OptimizationProfile[]>;
  profileVersions: Record<string, Record<string, string>>;
  favorites: Record<string, GameSummary>;
  recent: GameDetail[];
  lastSync: string | null;
  deviceId: string;
}

const KEY = 'goh_cache_v1';

function emptyShape(): CacheShape {
  return {
    home: null,
    games: {},
    gamesOrder: [],
    details: {},
    profiles: {},
    profileVersions: {},
    favorites: {},
    recent: [],
    lastSync: null,
    deviceId: '',
  };
}

function createDeviceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `dev-${hex}`;
}

export const cache: CacheStore = (() => {
  let state: CacheShape = emptyShape();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = { ...emptyShape(), ...(JSON.parse(raw) as CacheShape) };
    } catch {
      state = emptyShape();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable — the app keeps working in memory.
    }
    emit();
  }

  const listeners = new Set<() => void>();
  function emit() {
    for (const l of listeners) l();
  }

  load();

  return {
    load,
    save,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    clear: () => {
      state = emptyShape();
      save();
      emit();
    },

    getHome: () => state.home,
    setHome: (home) => {
      state.home = home;
      save();
    },

    getGames: () => state.gamesOrder.map((slug) => state.games[slug]!).filter(Boolean),
    setGames: (games) => {
      state.games = {};
      state.gamesOrder = [];
      for (const g of games) {
        state.games[g.slug] = g;
        state.gamesOrder.push(g.slug);
      }
      save();
    },
    upsertGames: (games) => {
      for (const g of games) {
        if (!state.games[g.slug]) state.gamesOrder.push(g.slug);
        state.games[g.slug] = g;
      }
      save();
    },
    removeGame: (slug) => {
      delete state.games[slug];
      state.gamesOrder = state.gamesOrder.filter((s) => s !== slug);
      delete state.details[slug];
      delete state.profiles[slug];
      save();
    },

    getGame: (slug) => state.details[slug] ?? null,
    setGame: (game) => {
      state.details[game.slug] = game;
      state.games[game.slug] = game;
      if (!state.gamesOrder.includes(game.slug)) state.gamesOrder.push(game.slug);
      save();
    },

    getProfiles: (gameSlug) => state.profiles[gameSlug] ?? null,
    setProfiles: (gameSlug, profiles) => {
      state.profiles[gameSlug] = profiles;
      const versions: Record<string, string> = {};
      for (const p of profiles) versions[p.slug] = p.version;
      state.profileVersions[gameSlug] = versions;
      save();
    },
    getProfileVersions: (gameSlug) => state.profileVersions[gameSlug] ?? {},
    setProfileVersions: (gameSlug, versions) => {
      state.profileVersions[gameSlug] = versions;
      save();
    },

    getFavorites: () => Object.values(state.favorites),
    isFavorite: (gameId) => Boolean(state.favorites[gameId]),
    addFavorite: (game) => {
      state.favorites[game.id] = game;
      save();
    },
    removeFavorite: (gameId) => {
      delete state.favorites[gameId];
      save();
    },

    getRecent: () => state.recent,
    addRecent: (game) => {
      state.recent = [game, ...state.recent.filter((r) => r.slug !== game.slug)].slice(0, 20);
      save();
    },

    getLastSync: () => state.lastSync,
    setLastSync: (ts) => {
      state.lastSync = ts;
      save();
    },

    getDeviceId: () => {
      if (!state.deviceId) {
        state.deviceId = createDeviceId();
        save();
      }
      return state.deviceId;
    },
    setDeviceId: (id) => {
      state.deviceId = id;
      save();
    },
  };
})();
