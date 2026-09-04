/**
 * The real OptiScaler manifest is 31 entries and 23 payloads. The gap is not a
 * packaging mistake — a proxy DLL has to exist under every name a game might
 * load — so the grouping has to keep all 31 destinations while fetching 23
 * times. Getting that backwards either wastes 171 MB or installs a game
 * without the file it looks for.
 */
import { describe, expect, it } from 'vitest';
import { groupByPayload } from '../optiflow';

/** The eight names OptiScaler's single 24 MB binary answers to. */
const PROXY_NAMES = [
  'OptiScaler.asi',
  'd3d12.dll',
  'dbghelp.dll',
  'dxgi.dll',
  'version.dll',
  'winhttp.dll',
  'wininet.dll',
  'winmm.dll',
];

const SHARED = '0c31b1ae49cb'.padEnd(64, '0');

describe('groupByPayload', () => {
  it('collapses one payload that ships under many names', () => {
    const files = PROXY_NAMES.map((filename) => ({ filename, sha256: SHARED }));
    const groups = groupByPayload(files);

    expect(groups.size).toBe(1);
    expect(groups.get(SHARED)).toHaveLength(8);
  });

  it('keeps every destination, so all eight are still installed', () => {
    const files = PROXY_NAMES.map((filename) => ({ filename, sha256: SHARED }));
    const kept = [...groupByPayload(files).values()].flat().map((f) => f.filename);
    expect(kept.sort()).toEqual([...PROXY_NAMES].sort());
  });

  it('treats different payloads separately', () => {
    const files = [
      { filename: 'a.dll', sha256: 'aa'.repeat(32) },
      { filename: 'b.dll', sha256: 'bb'.repeat(32) },
      { filename: 'c.dll', sha256: 'aa'.repeat(32) },
    ];
    const groups = groupByPayload(files);
    expect(groups.size).toBe(2);
    expect(groups.get('aa'.repeat(32))).toHaveLength(2);
  });

  it('matches hashes regardless of case', () => {
    // The API and the Web Crypto digest do not agree on case, and treating the
    // same bytes as two payloads because of it would download them twice.
    const files = [
      { filename: 'a.dll', sha256: 'AB'.repeat(32) },
      { filename: 'b.dll', sha256: 'ab'.repeat(32) },
    ];
    expect(groupByPayload(files).size).toBe(1);
  });
});
