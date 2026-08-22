import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * The optimizer resolves this path on disk, so a write that silently fails
 * means the user picks a game folder, sees no error, and the optimizer has
 * nowhere to install. A stored `null` made every write throw; a stored string
 * or number was worse — assigning a property to a primitive does nothing, so
 * the write "succeeded" and the value was gone on the next read.
 */
const KEY = 'goh_game_paths_v1';

function memoryStorage() {
  let data: Record<string, string> = {};
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {
      data = {};
    },
  };
}

describe('game path registry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('round-trips a path', async () => {
    const { getGamePath, setGamePath } = await import('../gamePaths');
    setGamePath('sekiro', 'C:/Games/Sekiro');
    expect(getGamePath('sekiro')).toBe('C:/Games/Sekiro');
  });

  it('still saves when the store already holds junk', async () => {
    const { getGamePath, setGamePath } = await import('../gamePaths');
    for (const junk of ['null', '"x"', '42', '[]', 'not json', '{"sekiro":null}', '{"sekiro":123}']) {
      localStorage.setItem(KEY, junk);
      setGamePath('sekiro', 'C:/Games/Sekiro');
      expect(getGamePath('sekiro'), `after junk ${junk}`).toBe('C:/Games/Sekiro');
    }
  });

  it('ignores stored entries that are not paths', async () => {
    localStorage.setItem(KEY, JSON.stringify({ good: 'C:/Games/Good', bad: 42, blank: '   ', nul: null }));
    const { getGamePath } = await import('../gamePaths');
    expect(getGamePath('good')).toBe('C:/Games/Good');
    expect(getGamePath('bad')).toBeNull();
    expect(getGamePath('blank')).toBeNull();
    expect(getGamePath('nul')).toBeNull();
  });

  it('clears a path when given an empty string', async () => {
    const { getGamePath, setGamePath } = await import('../gamePaths');
    setGamePath('sekiro', 'C:/Games/Sekiro');
    setGamePath('sekiro', '   ');
    expect(getGamePath('sekiro')).toBeNull();
  });
});
