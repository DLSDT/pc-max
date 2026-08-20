/**
 * Light/dark theme. Mirrors i18n.ts's language bootstrap: the persisted
 * choice (store/ui.ts `theme`, zustand `persist` under `goh_ui`) is read
 * synchronously and applied to <html> before React renders, so there's no
 * flash of the wrong theme on boot — only `main.tsx`'s eager `applyTheme`
 * call and the live toggle in Settings ever need to touch the DOM class.
 */
export type Theme = 'light' | 'dark';

export function loadPersistedTheme(): Theme {
  try {
    const raw = localStorage.getItem('goh_ui');
    if (!raw) return 'light';
    const parsed = JSON.parse(raw) as { state?: { theme?: string } };
    return parsed.state?.theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
