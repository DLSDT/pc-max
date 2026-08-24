/**
 * The install record is the only thing that makes an install reversible.
 *
 * Removal never guesses by filename — it undoes exactly what the record says
 * was written — so a record the UI cannot reach is an install the user cannot
 * undo. `listInstalls` is what the tool page's remove list reads, and until
 * that list existed nothing called it, so none of this was covered.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearInstall, getInstall, listInstalls, recordInstall, type MfgInstall } from '@/lib/mfgInstalls';

/** vitest runs in `node` here, so localStorage has to be supplied. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
}

const entry = (tool: MfgInstall['tool'], gameDir: string, installedAt: string): MfgInstall => ({
  tool,
  gameDir,
  launcherDir: gameDir,
  exePath: `${gameDir}\\game.exe`,
  version: '1.0.2',
  selection: { streamline: 'Streamline PC Max V2' },
  installedAt,
  backupDir: `${gameDir}\\.goh-backup`,
  files: [{ path: `${gameDir}\\sl.dlss.dll`, replaced: true }],
});

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('listInstalls', () => {
  it('returns every install of a tool, not just one', () => {
    // The case that mattered: a tester installs into several games and has to
    // be able to undo each without re-selecting its executable.
    recordInstall(entry('streamline', 'E:\\Resident Evil 2 2019', '2026-08-24T10:00:00.000Z'));
    recordInstall(entry('streamline', 'D:\\Games\\Cyberpunk 2077', '2026-08-24T11:00:00.000Z'));

    const all = listInstalls('streamline');
    expect(all).toHaveLength(2);
    expect(all.map((i) => i.gameDir).sort()).toEqual([
      'D:\\Games\\Cyberpunk 2077',
      'E:\\Resident Evil 2 2019',
    ]);
  });

  it('keeps two tools in one game apart', () => {
    // Same folder, two tools, two independent records — removing one must not
    // take the other's files with it.
    recordInstall(entry('streamline', 'E:\\Game', '2026-08-24T10:00:00.000Z'));
    recordInstall(entry('optiscaler', 'E:\\Game', '2026-08-24T10:00:00.000Z'));

    expect(listInstalls('streamline')).toHaveLength(1);
    expect(listInstalls('optiscaler')).toHaveLength(1);
    expect(listInstalls()).toHaveLength(2);
  });

  it('lists the newest install first', () => {
    recordInstall(entry('streamline', 'E:\\Older', '2026-08-20T10:00:00.000Z'));
    recordInstall(entry('streamline', 'E:\\Newer', '2026-08-24T10:00:00.000Z'));
    expect(listInstalls('streamline').map((i) => i.gameDir)).toEqual(['E:\\Newer', 'E:\\Older']);
  });

  it('does not report an install of a different tool', () => {
    recordInstall(entry('optiscaler', 'E:\\Game', '2026-08-24T10:00:00.000Z'));
    expect(listInstalls('streamline')).toEqual([]);
  });

  it('is empty rather than throwing when nothing was ever installed', () => {
    expect(listInstalls('streamline')).toEqual([]);
  });
});

describe('clearInstall', () => {
  it('removes only the record it names', () => {
    recordInstall(entry('streamline', 'E:\\Keep', '2026-08-24T10:00:00.000Z'));
    recordInstall(entry('streamline', 'E:\\Drop', '2026-08-24T11:00:00.000Z'));

    clearInstall('streamline', 'E:\\Drop');

    expect(listInstalls('streamline').map((i) => i.gameDir)).toEqual(['E:\\Keep']);
    expect(getInstall('streamline', 'E:\\Drop')).toBeNull();
    expect(getInstall('streamline', 'E:\\Keep')).not.toBeNull();
  });

  it('leaves the same folder`s other tool alone', () => {
    recordInstall(entry('streamline', 'E:\\Game', '2026-08-24T10:00:00.000Z'));
    recordInstall(entry('optiscaler', 'E:\\Game', '2026-08-24T10:00:00.000Z'));

    clearInstall('streamline', 'E:\\Game');

    expect(getInstall('streamline', 'E:\\Game')).toBeNull();
    expect(getInstall('optiscaler', 'E:\\Game')).not.toBeNull();
  });
});

describe('a record with no file list', () => {
  it('is ignored, because removing it would report success having done nothing', () => {
    localStorage.setItem(
      'goh_mfg_installs_v1',
      JSON.stringify({ 'streamline::E:\\Broken': { tool: 'streamline', gameDir: 'E:\\Broken' } }),
    );
    expect(listInstalls('streamline')).toEqual([]);
    expect(getInstall('streamline', 'E:\\Broken')).toBeNull();
  });
});
