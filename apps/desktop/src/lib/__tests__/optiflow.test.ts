/**
 * The client half of the OptiFlow pipeline.
 *
 * The property worth proving here is the integrity check. The manifest comes
 * from our API but the bytes come from object storage over a signed URL —
 * two different trust boundaries — so a file that does not match its published
 * hash must never reach the native installer, even though the installer would
 * also reject it. Failing here means nothing was ever staged toward a game
 * folder.
 */
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const mfgToolDownload = vi.fn();
const authorizeFeature = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@/lib/optimizer', () => ({ isTauriShell: () => true }));
vi.mock('@/lib/api', () => ({
  api: { mfgToolDownload: (...a: unknown[]) => mfgToolDownload(...a) },
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status = 500,
      public body: unknown = null,
      public kind: string = 'http',
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));
vi.mock('@/hooks/useFeatureAccess', () => ({
  authorizeFeature: (...a: unknown[]) => authorizeFeature(...a),
}));

import { componentNames, installTool, OptiFlowError, statusErrorFor } from '../optiflow';

const BYTES = new TextEncoder().encode('the real dll bytes');
/** sha256 of BYTES, computed the same way the browser will. */
async function hashOf(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await webcrypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function manifest(sha256: string) {
  return {
    tool: 'optiflow',
    package: { id: 'p1', name: 'OptiFlow', version: '1.0.1' },
    files: [
      {
        filename: 'sl.dlss_g.dll',
        destination: 'sl.dlss_g.dll',
        role: 'streamline',
        sha256,
        size: BYTES.length,
        operation: 'replace',
        url: 'https://storage.example/sl.dlss_g.dll',
        expiresIn: 300,
      },
    ],
  };
}

beforeEach(() => {
  invoke.mockReset().mockResolvedValue({ gameDir: 'C:/g', launcherDir: 'C:/g/bin', backupDir: 'C:/g/.goh-backup/x', written: [], skipped: [] });
  mfgToolDownload.mockReset();
  authorizeFeature.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(BYTES)));
  // vitest's node environment does not expose WebCrypto as a bare global the
  // way a webview does; the lib legitimately uses the browser API.
  vi.stubGlobal('crypto', webcrypto);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('installTool', () => {
  it('passes verified bytes to the native installer', async () => {
    mfgToolDownload.mockResolvedValue(manifest(await hashOf(BYTES)));

    await installTool({ tool: 'optiflow', exePath: 'C:/g/bin/game.exe' });

    expect(authorizeFeature).toHaveBeenCalledWith('multi_frame_generation');
    expect(invoke).toHaveBeenCalledWith('optiflow_install', expect.objectContaining({ exePath: 'C:/g/bin/game.exe' }));
    const [, args] = invoke.mock.calls[0]!;
    const payload = args as {
      files: { role: string; sha256: string }[];
      blobs: { sha256: string; contentBase64: string }[];
    };
    // Bytes travel once, in the blob table; the file list refers to them by hash.
    expect(atob(payload.blobs[0]!.contentBase64)).toBe('the real dll bytes');
    expect(payload.files[0]!.role).toBe('streamline');
    expect(payload.files[0]!.sha256).toBe(payload.blobs[0]!.sha256);
  });

  it('downloads a payload once when several files share it', async () => {
    // OptiScaler ships one 24 MB binary under eight proxy-DLL names so a game
    // loads whichever it looks for. Fetching it per name was 171 MB of a 424 MB
    // install, and put the same base64 through the IPC channel eight times.
    const sha = await hashOf(BYTES);
    const base = manifest(sha);
    const names = ['dxgi.dll', 'version.dll', 'winmm.dll'];
    mfgToolDownload.mockResolvedValue({
      ...base,
      files: names.map((filename) => ({ ...base.files[0]!, filename, destination: filename })),
    });
    const fetchMock = vi.fn(async () => new Response(BYTES));
    vi.stubGlobal('fetch', fetchMock);

    await installTool({ tool: 'optiflow', exePath: 'C:/g/bin/game.exe' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, args] = invoke.mock.calls[0]!;
    const payload = args as { files: { destination: string }[]; blobs: unknown[] };
    expect(payload.blobs).toHaveLength(1);
    // Every destination is still installed — the saving is in the download,
    // not in what lands in the game folder.
    expect(payload.files.map((f) => f.destination).sort()).toEqual([...names].sort());
  });

  it('asks the server to sign again when a link expires mid-download', async () => {
    // All the URLs are signed at once, so their shared TTL is really a deadline
    // for the whole transfer. On a link too slow for 424 MB in fifteen minutes
    // the files at the back used to 403 and take the install down with them.
    const sha = await hashOf(BYTES);
    mfgToolDownload.mockResolvedValue(manifest(sha));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('expired', { status: 403 }))
      .mockResolvedValue(new Response(BYTES));
    vi.stubGlobal('fetch', fetchMock);

    await installTool({ tool: 'optiflow', exePath: 'C:/g/bin/game.exe' });

    expect(mfgToolDownload).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalled();
  });

  it('refuses a download that does not match the published hash', async () => {
    // The API says one thing; storage returns another. This is the case the
    // check exists for, and nothing may reach the installer.
    mfgToolDownload.mockResolvedValue(manifest('0'.repeat(64)));

    await expect(installTool({ tool: 'optiflow', exePath: 'C:/g/bin/game.exe' })).rejects.toThrow(OptiFlowError);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports a failed download instead of installing a partial set', async () => {
    mfgToolDownload.mockResolvedValue(manifest(await hashOf(BYTES)));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));

    await expect(installTool({ tool: 'optiflow', exePath: 'C:/g/bin/game.exe' })).rejects.toThrow(/403/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not call the download endpoint when the entitlement check fails', async () => {
    authorizeFeature.mockRejectedValue(new Error('Subscription required'));

    await expect(installTool({ tool: 'optiflow', exePath: 'C:/g/bin/game.exe' })).rejects.toThrow('Subscription required');
    expect(mfgToolDownload).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('refuses an empty package rather than reporting a successful no-op', async () => {
    mfgToolDownload.mockResolvedValue({ ...manifest('x'), files: [] });

    await expect(installTool({ tool: 'optiflow', exePath: 'C:/g/bin/game.exe' })).rejects.toThrow(/no files/);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('componentNames', () => {
  it('asks the scanner only for files that replace something', () => {
    expect(
      componentNames([
        { destination: 'sl.dlss_g.dll', role: 'streamline' },
        { destination: 'version.dll', role: 'launcher' },
        { destination: 'bin/x64/OptiScaler.ini', role: 'relative' },
      ]),
    ).toEqual(['sl.dlss_g.dll']);
  });
});

describe('statusErrorFor', () => {
  it('turns a 404 into "your server is behind", not Fastify\'s route message', async () => {
    // This is what a tester actually saw on Windows: the desktop build shipped
    // with the tool endpoints before the API was deployed, and the page showed
    // "Route GET /api/v1/mfg/tools/optiflow not found" — an internal detail
    // addressed to nobody who could act on it.
    const { ApiError } = await import('@/lib/api');
    const err = new (ApiError as new (m: string, s: number, b: unknown, k: string) => Error)(
      'Route GET /api/v1/mfg/tools/optiflow not found',
      404,
      null,
      'http',
    );
    expect(statusErrorFor(err)).toEqual({ key: 'mfg.serverOutdated' });
  });

  it('says "unreachable" for a network failure or timeout', async () => {
    const { ApiError } = await import('@/lib/api');
    const mk = (kind: string, status = 0) =>
      new (ApiError as new (m: string, s: number, b: unknown, k: string) => Error)('boom', status, null, kind);
    expect(statusErrorFor(mk('network'))).toEqual({ key: 'mfg.serverUnreachable' });
    expect(statusErrorFor(mk('timeout'))).toEqual({ key: 'mfg.serverUnreachable' });
    expect(statusErrorFor(new Error('something else'))).toEqual({ key: 'mfg.serverUnreachable' });
  });

  it('keeps the server\'s own wording for errors written for the user', async () => {
    // A 403 already says "subscription required" in words the user can act on;
    // replacing it with a generic message would lose information.
    const { ApiError } = await import('@/lib/api');
    const err = new (ApiError as new (m: string, s: number, b: unknown, k: string) => Error)(
      'Your subscription does not include this feature',
      403,
      null,
      'http',
    );
    expect(statusErrorFor(err)).toEqual({ message: 'Your subscription does not include this feature' });
  });
});
