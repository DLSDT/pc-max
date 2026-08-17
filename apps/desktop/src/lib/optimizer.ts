import type { PackageDownloadResponse } from '@goh/types';
import { api } from './api';
import { recordAppliedPackage } from './backup';

/**
 * One-Click Optimization pipeline (Phase 14).
 *
 * Steps, each with progress callbacks so the UI can render a live pipeline:
 *   1. Fetch the entitlement-gated manifest (server re-checks entitlement).
 *   2. Download every file from its short-lived signed URL.
 *   3. Verify SHA-256 of every byte against the manifest (server-computed hash).
 *   4. Back up any existing originals (writer-dependent).
 *   5. Apply atomically (temp file + rename, per file).
 *   6. Record the applied package → feeds backup/restore.
 *
 * The actual file writes go through a FileWriter. In the Tauri shell that is
 * the Rust `apply_game_files` command (atomic + rollback); in a browser the
 * BrowsedStagedWriter verifies + stages the payload locally so the flow is
 * fully testable in the Preview.
 */

export type OptimizeStep =
  | 'manifest'
  | 'download'
  | 'verify'
  | 'backup'
  | 'apply'
  | 'done'
  | 'error';

export interface OptimizeProgress {
  step: OptimizeStep;
  /** 0..1 overall progress. */
  overall: number;
  /** Current file label (e.g. "Profiles/settings.cfg 2/3"). */
  label: string;
}

export interface StagedFile {
  destination: string;
  content: Uint8Array;
  sha256: string;
}

export interface FileWriter {
  /**
   * Apply verified files into the game directory. Implementations must
   * back up existing files first and roll back on failure (atomic per file).
   */
  apply(gameDir: string, files: StagedFile[]): Promise<void>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/** Tauri writer — delegates to the Rust `apply_game_files` command. */
const tauriWriter: FileWriter = {
  async apply(gameDir, files) {
    const { invoke } = await import('@tauri-apps/api/core');
    const payload = files.map((f) => ({
      destination: f.destination,
      contentBase64: bytesToBase64(f.content),
      sha256: f.sha256,
    }));
    await invoke('apply_game_files', { gameDir, files: payload });
  },
};

/** Browser-staged writer — verifies hashes, keeps the payload for download. */
const browserWriter: FileWriter = {
  async apply(_gameDir, files) {
    // Verify again at write time (defense in depth), then keep in memory so a
    // real desktop shell can flush them. In the Preview the "apply" completes
    // once every hash matches — the payload is also exposed via getStaged().
    for (const f of files) {
      const actual = await sha256Hex(f.content);
      if (actual !== f.sha256) throw new Error(`Hash mismatch for ${f.destination}`);
    }
    staged = files;
  },
};

let staged: StagedFile[] = [];
export function getStaged(): StagedFile[] {
  return staged;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

export function getWriter(): FileWriter {
  return isTauri() ? tauriWriter : browserWriter;
}

export function isTauriShell(): boolean {
  return isTauri();
}

export interface OptimizeOptions {
  gameSlug: string;
  gameName: string;
  packageSlug: string;
  gameDir: string;
  onProgress?: (p: OptimizeProgress) => void;
}

export class OptimizeError extends Error {
  constructor(
    message: string,
    public readonly step: OptimizeStep,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OptimizeError';
  }
}

export async function optimizeGame(opts: OptimizeOptions): Promise<PackageDownloadResponse> {
  const { gameSlug, gameName, packageSlug, gameDir, onProgress } = opts;

  const progress = (step: OptimizeStep, overall: number, label = '') => {
    onProgress?.({ step, overall, label });
  };

  // 1. Manifest (entitlement re-checked server-side).
  progress('manifest', 0.05, gameSlug);
  let manifest: PackageDownloadResponse;
  try {
    manifest = await api.downloadPackage(gameSlug, packageSlug);
  } catch (e) {
    throw new OptimizeError('Failed to fetch the package manifest — a premium subscription may be required.', 'manifest', e);
  }

  // 2 + 3. Download every file from its signed URL and verify SHA-256.
  const verified: StagedFile[] = [];
  const total = manifest.files.length;
  for (let i = 0; i < total; i++) {
    const f = manifest.files[i]!;
    progress('download', 0.05 + (0.6 * i) / total, `${f.destination} (${i + 1}/${total})`);
    let bytes: Uint8Array;
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      throw new OptimizeError(`Failed to download ${f.filename} — the signed link may have expired. Try again.`, 'download', e);
    }
    progress('verify', 0.65 + (0.15 * i) / total, `${f.destination} (${i + 1}/${total})`);
    const actual = await sha256Hex(bytes);
    if (actual !== f.sha256) {
      throw new OptimizeError(`Checksum mismatch for ${f.filename} — expected ${f.sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}….`, 'verify');
    }
    verified.push({ destination: f.destination, content: bytes, sha256: f.sha256 });
  }

  // 4 + 5. Backup + atomic apply through the writer (rollback on failure).
  progress('backup', 0.85, `${verified.length} file(s)`);
  try {
    await getWriter().apply(gameDir, verified);
  } catch (e) {
    throw new OptimizeError(
      e instanceof Error ? `Apply failed: ${e.message}` : 'Apply failed — the game directory may be read-only.',
      'apply',
      e,
    );
  }

  // 6. Record applied state (feeds backup/restore).
  recordAppliedPackage({
    gameSlug,
    gameName,
    packageSlug: manifest.package.slug,
    packageName: manifest.package.name,
    version: manifest.package.version,
  });

  progress('done', 1, `${verified.length} file(s) applied`);
  return manifest;
}

// ---------------------------------------------------------------------------
// helpers

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('WebCrypto unavailable');
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
