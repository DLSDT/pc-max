/**
 * Add-a-game-by-executable flow (spec: user browses to a game's .exe, PC MAX
 * matches it against the catalog and resolves an icon).
 *
 * Browser preview has no filesystem access — every function here is a no-op
 * (returns null) outside the Tauri shell, same convention as lib/detect.ts.
 */
import { isTauriShell } from '@/lib/optimizer';

/** Open the native "select executable" dialog. Returns the chosen path, or null if cancelled / unavailable. */
export async function selectGameExecutable(): Promise<string | null> {
  if (!isTauriShell()) return null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Executable', extensions: ['exe'] }],
    });
    return typeof selected === 'string' ? selected : null;
  } catch {
    return null;
  }
}

/** Ask the Rust backend to extract the icon embedded in an .exe as a PNG data URL. */
export async function extractGameIcon(exePath: string): Promise<string | null> {
  if (!isTauriShell()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('extract_game_icon', { exePath })) as string;
  } catch {
    return null;
  }
}

/** Split a Windows path into (parent directory, file name). */
export function splitPath(path: string): { dir: string; file: string } {
  const parts = path.split(/[\\/]/);
  const file = parts.pop() ?? path;
  return { dir: parts.join('\\'), file };
}
