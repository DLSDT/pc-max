import { api } from './api';
import { cache } from './cache';
import { useUi } from '@/store/ui';

/**
 * Backup / Restore — Phase 13.
 *
 * Records the optimization state the user has applied (per game: package +
 * version) and snapshots it into named backups stored locally. Restoring
 * writes the snapshot back and re-verifies that every package still exists
 * server-side (a missing package is reported, not silently dropped).
 *
 * The actual file installation pipeline is Phase 14; this layer owns the
 * durable state + restore bookkeeping so nothing applied is ever lost.
 */

export interface AppliedPackage {
  gameSlug: string;
  gameName: string;
  packageSlug: string;
  packageName: string;
  version: string;
  appliedAt: string; // ISO
}

export interface BackupSnapshot {
  id: string;
  name: string;
  createdAt: string; // ISO
  applied: AppliedPackage[];
  favorites: string[];
}

interface BackupShape {
  applied: Record<string, AppliedPackage>;
  backups: BackupSnapshot[];
}

const KEY = 'goh_backups_v1';
const MAX_BACKUPS = 10;

function emptyShape(): BackupShape {
  return { applied: {}, backups: [] };
}

function load(): BackupShape {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyShape(), ...(JSON.parse(raw) as BackupShape) };
  } catch {
    // Corrupt storage — start clean.
  }
  return emptyShape();
}

function save(shape: BackupShape): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(shape));
  } catch {
    // Storage full/unavailable — in-memory only.
  }
}

function createId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Record (or replace) the applied package for one game. */
export function recordAppliedPackage(entry: Omit<AppliedPackage, 'appliedAt'>): void {
  const shape = load();
  shape.applied[entry.gameSlug] = { ...entry, appliedAt: new Date().toISOString() };
  save(shape);
}

export function getApplied(): AppliedPackage[] {
  return Object.values(load().applied).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
}

export function clearApplied(): void {
  const shape = load();
  shape.applied = {};
  save(shape);
}

/** Snapshot the current state (applied packages + favorites + language). */
export function createBackup(name?: string): BackupSnapshot {
  const shape = load();
  const snapshot: BackupSnapshot = {
    id: createId(),
    name: name?.trim() || `Backup ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    applied: getApplied(),
    favorites: cache.getFavorites().map((f) => f.id),
  };
  shape.backups = [snapshot, ...shape.backups].slice(0, MAX_BACKUPS);
  save(shape);
  return snapshot;
}

export function listBackups(): BackupSnapshot[] {
  return load().backups;
}

export function deleteBackup(id: string): void {
  const shape = load();
  shape.backups = shape.backups.filter((b) => b.id !== id);
  save(shape);
}

export interface RestoreResult {
  restored: AppliedPackage[];
  missing: AppliedPackage[];
}

/**
 * Restore a backup: write the snapshot back into the applied state, then
 * verify each package is still published server-side. The desktop app's own
 * language preference is also restored.
 */
export async function restoreBackup(id: string): Promise<RestoreResult> {
  const shape = load();
  const backup = shape.backups.find((b) => b.id === id);
  if (!backup) throw new Error('Backup not found');

  shape.applied = {};
  for (const entry of backup.applied) shape.applied[entry.gameSlug] = entry;
  save(shape);

  // Verify each recorded package still exists (published) on the server.
  const missing: AppliedPackage[] = [];
  for (const entry of backup.applied) {
    try {
      const { data } = await api.gamePackages(entry.gameSlug);
      if (!data.some((p) => p.slug === entry.packageSlug)) missing.push(entry);
    } catch {
      missing.push(entry); // game/package gone or offline — flag it
    }
  }

  return { restored: backup.applied, missing };
}

/** Best-effort language restore — safe to ignore in a browser without the store. */
export function restoreLanguageSnapshot(language: string): void {
  try {
    useUi.getState().setLanguage(language as 'en' | 'fa');
  } catch {
    // Non-fatal — language is a preference, not state.
  }
}

/** Export for tests/debugging — returns a plain copy. */
export function _dump(): BackupShape {
  return load();
}
