import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { applyDirection } from '@/i18n';
import { useUi } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { useInitialSync, useRefetchOnReconnect } from '@/hooks/useLibrary';
import { useAppVersionCheck } from '@/hooks/useAppVersion';
import ErrorBoundary from '@/components/ErrorBoundary';
import Sidebar from './Sidebar';
import Header from './Header';
import { Button } from '@/components/ui';
import { installNativeUpdate, isTauriShell } from '@/lib/updater';
import { cn } from '@/lib/utils';

/**
 * App shell: collapsible sidebar + header + scrollable content area.
 * Kicks off the initial cache-first sync on mount and keeps the document
 * direction in sync with the active language (RTL for Persian).
 */
export default function AppLayout() {
  const { t, i18n } = useTranslation();
  const sidebarCollapsed = useUi((s) => s.sidebarCollapsed);
  const navOpen = useUi((s) => s.navOpen);
  const setNavOpen = useUi((s) => s.setNavOpen);
  const updateRequired = useUi((s) => s.updateRequired);
  const offlineSession = useAuth((s) => s.offline);
  const reconnect = useAuth((s) => s.restore);
  const { pathname } = useLocation();

  useInitialSync();
  useRefetchOnReconnect();
  useAppVersionCheck();

  useEffect(() => {
    applyDirection(i18n.language);
  }, [i18n.language]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      {/* Backdrop for the narrow-screen nav drawer. Tapping anywhere off the
          drawer closes it, which is the gesture people try first. */}
      {navOpen && (
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
        />
      )}
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {updateRequired && (
          <div className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-sm">
            <span className="flex items-center gap-2 font-medium text-amber-300">
              <AlertTriangle aria-hidden className="size-4" />
              {t('updater.required')}
            </span>
            {isTauriShell() && (
              <Button size="sm" variant="outline" onClick={() => void installNativeUpdate()}>
                {t('updater.updateNow')}
              </Button>
            )}
          </div>
        )}
        {/* The session was restored from disk because the server was
            unreachable. Cached content works; anything that needs the API will
            not, so say so rather than letting requests fail unexplained. */}
        {offlineSession && (
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-border bg-secondary/60 px-6 py-2 text-xs text-muted-foreground">
            <WifiOff aria-hidden className="size-3.5 shrink-0" />
            <span>{t('auth.offlineSession')}</span>
            <button
              type="button"
              onClick={() => void reconnect()}
              className="rounded font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('common.retry')}
            </button>
          </div>
        )}
        <Header />
        <main
          id="main-content"
          className={cn(
            'flex-1 overflow-y-auto overscroll-contain bg-glow px-6 pb-10 pt-6 transition-[padding]',
            sidebarCollapsed ? 'lg:px-8' : 'lg:px-10',
          )}
        >
          <div className="mx-auto w-full max-w-7xl animate-fade-up">
            <ErrorBoundary resetKey={pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
