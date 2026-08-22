import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * getApplied() runs on the dashboard, so anything that makes it throw takes the
 * home screen down. Parsed-but-wrong storage did exactly that: a stored
 * `{"applied": null}` spread over the defaults, replacing `{}` with null, and
 * Object.values(null) threw.
 */
const KEY = 'goh_backups_v1';

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

describe('backup storage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(7) });
  });

  it('survives every shape a corrupt entry can take', async () => {
    const { getApplied, listBackups } = await import('../backup');
    for (const corrupt of [
      '{"applied":null}',
      '{"backups":null}',
      '{"applied":[]}',
      '{"backups":{}}',
      '{"backups":[null,1,"x"]}',
      '"a string"',
      '42',
      'null',
      '[]',
      'not json at all',
      '',
    ]) {
      localStorage.setItem(KEY, corrupt);
      expect(() => getApplied(), `getApplied on ${corrupt}`).not.toThrow();
      expect(() => listBackups(), `listBackups on ${corrupt}`).not.toThrow();
      expect(getApplied()).toEqual([]);
    }
  });

  it('still round-trips real data', async () => {
    const { recordAppliedPackage, getApplied } = await import('../backup');
    recordAppliedPackage({
      gameSlug: 'sekiro',
      gameName: 'Sekiro',
      packageSlug: 'dlss',
      packageName: 'DLSS',
      version: '1.0.0',
    });
    const applied = getApplied();
    expect(applied).toHaveLength(1);
    expect(applied[0]!.gameSlug).toBe('sekiro');
    expect(applied[0]!.appliedAt).toBeTruthy();
  });

  it('keeps good entries when only part of the store is broken', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        applied: { sekiro: { gameSlug: 'sekiro', gameName: 'Sekiro', packageSlug: 'p', packageName: 'P', version: '1', appliedAt: '2026-01-01T00:00:00Z' } },
        backups: null,
      }),
    );
    const { getApplied, listBackups } = await import('../backup');
    // A broken backups list must not cost the user their applied state.
    expect(getApplied()).toHaveLength(1);
    expect(listBackups()).toEqual([]);
  });
});
