/**
 * Hand a URL to the user's real browser.
 *
 * `window.open` is a silent no-op inside the Tauri webview — no window, no
 * error, nothing to catch. That is how the payment gateway never opened and
 * the purchase page sat on "waiting for confirmation" until it timed out. The
 * opener plugin passes the URL to the OS instead.
 *
 * Outside the shell (vite dev in a browser) `window.open` is the right call,
 * so the check is on the shell rather than on the platform.
 */
import { isTauriShell } from './updater';

export async function openExternal(url: string): Promise<void> {
  if (!isTauriShell()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}
