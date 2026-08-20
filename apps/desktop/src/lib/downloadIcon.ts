import { save } from '@tauri-apps/plugin-dialog';
import { isTauriShell } from './optimizer';

/**
 * Save a bundled game icon to a location the user picks.
 *
 * Two paths, because the app runs in two shells:
 *  - Packaged (Tauri): the webview ignores the `download` attribute, so ask
 *    for a destination with the native save dialog and write the bytes through
 *    the `save_binary_file` command.
 *  - Browser (dev preview): a plain anchor download is all that is available.
 *
 * Returns the saved path in Tauri, '' in the browser, or null if the user
 * cancelled the dialog.
 */
export async function downloadGameIcon(iconUrl: string, fileName: string): Promise<string | null> {
  const res = await fetch(iconUrl);
  if (!res.ok) throw new Error(`Icon not available (HTTP ${res.status})`);
  const blob = await res.blob();

  if (!isTauriShell()) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return '';
  }

  const path = await save({
    defaultPath: fileName,
    filters: [{ name: 'PNG image', extensions: ['png'] }],
  });
  if (!path) return null; // user cancelled

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('save_binary_file', { path, contentBase64: btoa(binary) });
  return path;
}
