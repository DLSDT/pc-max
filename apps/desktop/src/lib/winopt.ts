/**
 * PC MAX Windows Optimizer — typed client for the Rust `winopt` engine.
 *
 * All optimization logic (catalog, allowlists, transaction engine, snapshots,
 * recovery) lives in Rust (`src-tauri/src/winopt.rs`). This module only
 * marshals types and calls the Tauri commands. In the browser preview there is
 * no Windows filesystem, so every call returns an honest "not supported" state
 * — nothing is simulated or fabricated.
 */

export type Risk = 'low' | 'medium' | 'high' | 'experimental';
export type Category =
  | 'startup'
  | 'processes'
  | 'services'
  | 'gaming'
  | 'power'
  | 'visual_effects'
  | 'network'
  | 'privacy'
  | 'cleanup'
  | 'advanced';
export type TxStatus = 'active' | 'committed' | 'rolled_back' | 'failed';

export interface TweakStatus {
  id: string;
  name: string;
  description: string;
  category: Category;
  risk: Risk;
  requiresAdmin: boolean;
  requiresRestart: boolean;
  supported: boolean;
  applied: boolean;
  reason: string;
}

export interface ScanResult {
  supported: boolean;
  reason: string;
  windowsVersion: [number, number] | null;
  laptop: boolean;
  tweaks: TweakStatus[];
  appliedIds: string[];
}

export interface SnapshotMeta {
  id: string;
  createdAt: string;
  profile: string;
  changeCount: number;
  tweaks: string[];
}

export interface ApplyResult {
  snapshotId: string;
  status: TxStatus;
  appliedTweaks: string[];
  changeCount: number;
  error: string | null;
  requiresRestart: boolean;
}

export interface RecoveryReport {
  interrupted: boolean;
  recovered: boolean;
  rolledBackChanges: number;
  message: string;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    // Browser preview — the engine only exists inside the packaged app.
    throw new Error('windows_only');
  }
  const { invoke: call } = await import('@tauri-apps/api/core');
  return call<T>(cmd, args);
}

/** Full scan: system info + per-tweak detection. */
export async function windowsScan(): Promise<ScanResult> {
  try {
    return await invoke<ScanResult>('windows_scan');
  } catch {
    return {
      supported: false,
      reason: 'Windows optimization runs inside the packaged PC MAX Windows application.',
      windowsVersion: null,
      laptop: false,
      tweaks: [],
      appliedIds: [],
    };
  }
}

/** Apply a set of tweaks as one reversible transaction. */
export async function windowsApply(profile: string, tweakIds: string[]): Promise<ApplyResult> {
  return invoke<ApplyResult>('windows_apply', { profile, tweakIds });
}

/** Restore a snapshot (roll back every recorded change). */
export async function windowsRestore(snapshotId: string): Promise<number> {
  return invoke<number>('windows_restore', { snapshotId });
}

export async function windowsSnapshots(): Promise<SnapshotMeta[]> {
  try {
    return await invoke<SnapshotMeta[]>('windows_snapshots');
  } catch {
    return [];
  }
}

export async function windowsRecover(): Promise<RecoveryReport> {
  try {
    return await invoke<RecoveryReport>('windows_recover');
  } catch {
    return { interrupted: false, recovered: false, rolledBackChanges: 0, message: 'windows_only' };
  }
}

export const RISK_ORDER: Record<Risk, number> = { low: 0, medium: 1, high: 2, experimental: 3 };

export const CATEGORY_ORDER: Record<Category, number> = {
  startup: 0,
  processes: 1,
  services: 2,
  gaming: 3,
  power: 4,
  visual_effects: 5,
  network: 6,
  privacy: 7,
  cleanup: 8,
  advanced: 9,
};

/** Profile bitmask (mirrors Rust): bit0 = safe, bit1 = gaming, bit2 = competitive. */
export const PROFILES: Record<string, { bit: number; label: string; hint: string }> = {
  safe: { bit: 0, label: 'Safe', hint: 'Low-risk changes only — ideal for everyday use.' },
  gaming: { bit: 1, label: 'Gaming', hint: 'Prioritizes gaming consistency and background reduction.' },
  competitive: { bit: 2, label: 'Competitive', hint: 'More aggressive configuration — every change explained and reversible.' },
};
