/**
 * OptiFlow install pipeline — server manifest to native install.
 *
 * The split of responsibility here is the point:
 *
 * - the **server** decides whether the user may install at all (the download
 *   endpoint is entitlement-gated) and what the files are (name, role, hash);
 * - the **Rust layer** decides *where* they go, because only it can see the
 *   user's disk, and every path it produces is bounds-checked against the
 *   resolved game folder;
 * - this file is the courier. It verifies each download against the hash the
 *   server published before handing anything to the installer, so a tampered
 *   CDN response fails here rather than in a game directory.
 *
 * Outside the Tauri shell (the browser preview) there is no filesystem, and
 * every function that would touch one returns a clear "not available" instead
 * of pretending to work.
 */
import type { MfgTool, MfgToolPackageResponse, PackageComponent, PackageFileRole } from '@goh/validation';
import { api, ApiError } from '@/lib/api';
import { isTauriShell } from '@/lib/optimizer';
import { authorizeFeature } from '@/hooks/useFeatureAccess';

export interface ScanReport {
  gameDir: string;
  launcherDir: string;
  executable: string;
  found: { filename: string; locations: string[] }[];
  missing: string[];
  truncated: boolean;
}

export interface InstallReport {
  gameDir: string;
  launcherDir: string;
  backupDir: string;
  written: { filename: string; path: string; role: PackageFileRole; replaced: boolean }[];
  skipped: { filename: string; reason: string }[];
}

export class OptiFlowError extends Error {}

function requireShell(): void {
  if (!isTauriShell()) {
    throw new OptiFlowError('Installing needs the desktop app — this is the browser preview.');
  }
}

/** Open the native file picker for the game's executable. */
export async function pickGameExecutable(): Promise<string | null> {
  requireShell();
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Game executable', extensions: ['exe'] }],
  });
  return typeof selected === 'string' ? selected : null;
}

/**
 * Read-only inspection of a chosen executable: which components the game
 * ships, and where. Nothing is written, so this can run the moment the user
 * picks a file — the page shows them the plan before they commit to it.
 */
export async function scanGame(exePath: string, components: string[]): Promise<ScanReport> {
  requireShell();
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke('optiflow_scan', { exePath, components })) as ScanReport;
}

/** Base64 without blowing the argument limit on a 57 MB DLL. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface FetchProgress {
  filename: string;
  index: number;
  total: number;
}

/**
 * Fetch every file in a manifest and verify it against the published hash.
 *
 * The hash check is not belt-and-braces: the manifest comes from our API but
 * the bytes come from object storage over a signed URL, and those are separate
 * trust boundaries. A file that does not match is a hard failure — the Rust
 * side checks again before writing, but failing here means nothing has been
 * staged toward a game folder at all.
 */
async function fetchManifest(
  pkg: MfgToolPackageResponse,
  onProgress?: (p: FetchProgress) => void,
): Promise<{ filename: string; destination: string; role: PackageFileRole; contentBase64: string; sha256: string }[]> {
  const out: { filename: string; destination: string; role: PackageFileRole; contentBase64: string; sha256: string }[] = [];
  for (let i = 0; i < pkg.files.length; i += 1) {
    const file = pkg.files[i]!;
    onProgress?.({ filename: file.filename, index: i, total: pkg.files.length });
    const res = await fetch(file.url);
    if (!res.ok) throw new OptiFlowError(`Could not download ${file.filename} (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const actual = await sha256Hex(bytes);
    if (actual.toLowerCase() !== file.sha256.toLowerCase()) {
      throw new OptiFlowError(`${file.filename} failed its integrity check — the download was not what the server published.`);
    }
    out.push({
      filename: file.filename,
      destination: file.destination,
      role: file.role,
      contentBase64: toBase64(bytes),
      sha256: file.sha256,
    });
  }
  return out;
}

/** The Streamline component names in a manifest — what `scanGame` looks for. */
export function componentNames(files: { destination: string; role: PackageFileRole }[]): string[] {
  return files.filter((f) => f.role === 'streamline').map((f) => f.destination);
}

/** A single profile name, or a choice per component group. Keyed by component
 *  so a new axis needs no change here. */
export type ToolSelection = string | null | Partial<Record<PackageComponent, string | null>>;

export interface InstallOptions {
  tool: MfgTool;
  exePath: string;
  /** A single profile name, or an installer/plan/order combination. */
  variant?: ToolSelection;
  onProgress?: (p: FetchProgress) => void;
}

/**
 * The full install: re-authorise, download, verify, hand to the native
 * installer.
 *
 * `authorizeFeature` runs even though the page already rendered an unlocked
 * view, because the page's answer is minutes old and a subscription can lapse
 * in between. The download endpoint enforces it a second time regardless —
 * this call exists so a lapsed user gets a clear message instead of a 403 in
 * the middle of fetching files.
 */
export async function installTool({ tool, exePath, variant, onProgress }: InstallOptions): Promise<InstallReport> {
  requireShell();
  await authorizeFeature('multi_frame_generation');
  // The server resolves base + selected profile and rejects an unknown name,
  // so the client never has to work out which files a profile implies.
  const pkg = await api.mfgToolDownload(tool, variant ?? null);
  if (pkg.files.length === 0) throw new OptiFlowError('This package has no files yet.');

  const files = await fetchManifest(pkg, onProgress);
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke('optiflow_install', { exePath, files })) as InstallReport;
}

/**
 * Which message to show when the tool-status probe fails.
 *
 * A 404 on this endpoint has one meaning: the desktop build is newer than the
 * API it is talking to. Fastify answers with "Route GET /api/v1/... not found",
 * which is true and completely useless to the person reading it — they cannot
 * deploy a server. Everything else keeps the server's own wording, because a
 * 403 or a rate-limit message is written for the user already.
 *
 * Returns an i18n key, so the caller stays responsible for translation.
 */
export type StatusErrorKind = { key: 'mfg.serverOutdated' | 'mfg.serverUnreachable' } | { message: string };

export function statusErrorFor(err: unknown): StatusErrorKind {
  if (err instanceof ApiError) {
    if (err.status === 404) return { key: 'mfg.serverOutdated' };
    if (err.kind === 'network' || err.kind === 'timeout' || err.status === 0) return { key: 'mfg.serverUnreachable' };
    return { message: err.message };
  }
  return { key: 'mfg.serverUnreachable' };
}

/**
 * Undo a recorded install.
 *
 * The record — which files were written, which of them replaced something, and
 * where the originals were backed up — is the only input. Nothing is matched by
 * name, so a copy of the same DLL the user put somewhere themselves is never
 * touched.
 */
export interface UninstallReport {
  restored: string[];
  removed: string[];
  failed: { filename: string; reason: string }[];
  missing: string[];
}

export async function uninstallTool(args: {
  /** The executable recorded at install time. The native side re-derives the
   *  game root from it rather than trusting a folder we hand over — the record
   *  and the boundary must not come from the same place. */
  exePath: string;
  backupDir: string;
  files: { path: string; replaced: boolean }[];
}): Promise<UninstallReport> {
  requireShell();
  if (args.files.length === 0) {
    throw new OptiFlowError('There is no record of what was installed, so nothing can be safely removed.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke('optiflow_uninstall', args)) as UninstallReport;
}
