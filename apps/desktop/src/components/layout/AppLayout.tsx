import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { applyDirection } from '@/i18n';
import { useUi } from '@/store/ui';
import { useInitialSync } from '@/hooks/useLibrary';
import { useAppVersionCheck } from '@/hooks/useAppVersion';
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
  const updateRequired = useUi((s) => s.updateRequired);

  useInitialSync();
  useAppVersionCheck();

  useEffect(() => {
    applyDirection(i18n.language);
  }, [i18n.language]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
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
        <Header />
        <main
          id="main-content"
          className={cn(
            'flex-1 overflow-y-auto bg-glow px-6 pb-10 pt-6 transition-[padding]',
            sidebarCollapsed ? 'lg:px-8' : 'lg:px-10',
          )}
        >
          <div className="mx-auto w-full max-w-7xl animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
