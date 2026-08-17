'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { Sidebar } from '@/components/shell/sidebar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, setAccessToken } from '@/lib/api';
import type { AdminMe } from '@goh/types';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    apiFetch<AdminMe>('/admin/auth/me')
      .then(setMe)
      .catch(() => router.replace('/login'));
  }, [router]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAccessToken(null);
    router.replace('/login');
  }

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-sm space-y-3 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar me={me} />

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-60 border-r bg-card p-3">
            <button className="mb-3 flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" onClick={() => setMobileOpen(false)}>
              <X className="h-4 w-4" />
            </button>
            <Sidebar me={me} />
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium text-muted-foreground">PC MAX</div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
