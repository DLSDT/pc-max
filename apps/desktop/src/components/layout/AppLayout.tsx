import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applyDirection } from '@/i18n';
import { useUi } from '@/store/ui';
import { useInitialSync } from '@/hooks/useLibrary';
import { useAppVersionCheck } from '@/hooks/useAppVersion';
import Sidebar from './Sidebar';
import Header from './Header';
import { cn } from '@/lib/utils';

/**
 * App shell: collapsible sidebar + header + scrollable content area.
 * Kicks off the initial cache-first sync on mount and keeps the document
 * direction in sync with the active language (RTL for Persian).
 */
export default function AppLayout() {
  const { i18n } = useTranslation();
  const sidebarCollapsed = useUi((s) => s.sidebarCollapsed);

  useInitialSync();
  useAppVersionCheck();

  useEffect(() => {
    applyDirection(i18n.language);
  }, [i18n.language]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
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
