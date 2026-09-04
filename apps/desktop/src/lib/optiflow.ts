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
  /** Distinct payloads fetched so far, not manifest entries. */
  index: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
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
type ManifestFile = MfgToolPackageResponse['files'][number];

/**
 * Manifest entries grouped by the bytes they actually contain.
 *
 * A package names the same payload several times on purpose: OptiScaler ships
 * one binary as `dxgi.dll`, `version.dll`, `winmm.dll` and five more, so a game
 * loads whichever proxy it looks for. They are separate destinations and every
 * one of them has to be written — but they are one download.
 */
export function groupByPayload<T extends { sha256: string }>(files: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const f of files) {
    const key = f.sha256.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(f);
    else groups.set(key, [f]);
  }
  return groups;
}
/** What the native installer is handed: the list, plus each payload once. */
interface StagedPayload {
  files: { filename: string; destination: string; role: PackageFileRole; sha256: string }[];
  blobs: { sha256: string; contentBase64: string }[];
}

/**
 * Fetch one copy of each distinct payload, re-signing links that expire.
 *
 * Two things were wrong with fetching the manifest entry by entry. OptiScaler's
 * 31 entries are only 23 distinct payloads — one 24 MB binary answers to eight
 * DLL names so a game loads whichever it looks for — so 171 MB of a 424 MB
 * install was the same bytes over and over.
 *
 * And every URL is signed at the same instant with one TTL, which quietly makes
 * that TTL a deadline for the whole download: on a link too slow to finish
 * 424 MB inside fifteen minutes, the URLs for the files at the back expire
 * before their turn and the install dies partway with a 403. Asking the server
 * to sign again costs one request and keeps everything already fetched.
 */
async function fetchManifest(
  pkg: MfgToolPackageResponse,
  onProgress?: (p: FetchProgress) => void,
  resign?: () => Promise<MfgToolPackageResponse>,
): Promise<StagedPayload> {
  const groups = groupByPayload(pkg.files);
  const distinct = [...groups.values()];
  const bytesTotal = distinct.reduce((n, g) => n + (g[0]!.size || 0), 0);
  let bytesDone = 0;

  const blobs: StagedPayload['blobs'] = [];
  const files: StagedPayload['files'] = [];

  for (let i = 0; i < distinct.length; i += 1) {
    const group = distinct[i]!;
    const file = group[0]!;
    onProgress?.({ filename: file.filename, index: i, total: distinct.length, bytesDone, bytesTotal });

    const bytes = await fetchWithResign(file, groups, resign);
    const actual = await sha256Hex(bytes);
    if (actual.toLowerCase() !== file.sha256.toLowerCase()) {
      throw new OptiFlowError(`${file.filename} failed its integrity check — the download was not what the server published.`);
    }

    blobs.push({ sha256: file.sha256, contentBase64: toBase64(bytes) });
    for (const f of group) {
      files.push({ filename: f.filename, destination: f.destination, role: f.role, sha256: f.sha256 });
    }

    bytesDone += file.size || bytes.length;
    onProgress?.({ filename: file.filename, index: i + 1, total: distinct.length, bytesDone, bytesTotal });
  }

  return { files, blobs };
}

/**
 * One payload, with a second attempt on a freshly signed link.
 *
 * 403 is what an expired signature looks like from here. It is retried once and
 * only once: a link that is still refused after being re-signed is refused for
 * some other reason, and retrying that forever would hang the install instead
 * of failing it.
 */
async function fetchWithResign(
  file: ManifestFile,
  groups: Map<string, ManifestFile[]>,
  resign?: () => Promise<MfgToolPackageResponse>,
): Promise<Uint8Array> {
  let url = file.url;
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url);
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    if (res.status !== 403 || attempt > 0 || !resign) {
      throw new OptiFlowError(`Could not download ${file.filename} (${res.status})`);
    }
    const fresh = await resign();
    const match = fresh.files.find((f) => f.sha256.toLowerCase() === file.sha256.toLowerCase());
    if (!match) throw new OptiFlowError(`Could not download ${file.filename} (${res.status})`);
    url = match.url;
    // Keep the rest of the batch on fresh links too, so the next expiry does
    // not cost another round trip.
    for (const [key, group] of groups) {
      const updated = fresh.files.find((f) => f.sha256.toLowerCase() === key);
      if (updated) for (const g of group) g.url = updated.url;
    }
  }
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

  const { files, blobs } = await fetchManifest(pkg, onProgress, () => api.mfgToolDownload(tool, variant ?? null));
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke('optiflow_install', { exePath, files, blobs })) as InstallReport;
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
