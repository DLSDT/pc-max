'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Gamepad2,
  LayoutDashboard,
  ListTree,
  Tags,
  Settings2,
  Rocket,
  Users,
  ScrollText,
  ShieldCheck,
  Layers,
  CreditCard,
  BadgeCheck,
  PackageOpen,
  MonitorSmartphone,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminMe } from '@goh/types';

interface SidebarProps {
  me: AdminMe;
}

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'analytics.read' },
  { href: '/games', label: 'Games', icon: Gamepad2, perm: 'games.read' },
  { href: '/categories', label: 'Categories', icon: ListTree, perm: 'games.read' },
  { href: '/tags', label: 'Tags', icon: Tags, perm: 'games.read' },
  { href: '/optimization-categories', label: 'Optimization Categories', icon: Layers, perm: 'optimizations.read' },
  { href: '/versions', label: 'App Versions', icon: Rocket, perm: 'releases.read' },
  { href: '/users', label: 'Users', icon: Users, perm: 'users.read' },
  { href: '/subscriptions', label: 'Subscriptions', icon: BadgeCheck, perm: 'subscriptions.read' },
  { href: '/subscriptions/plans', label: 'Subscription Plans', icon: CreditCard, perm: 'subscriptions.read' },
  { href: '/payments', label: 'Payments', icon: CreditCard, perm: 'payments.read' },
  { href: '/packages', label: 'Optimization Packages', icon: PackageOpen, perm: 'packages.read' },
  { href: '/devices', label: 'Devices', icon: MonitorSmartphone, perm: 'devices.read' },
  { href: '/security', label: 'Security', icon: ShieldAlert, perm: 'settings.read' },
  { href: '/settings', label: 'Settings', icon: SlidersHorizontal, perm: 'settings.read' },
  { href: '/admins', label: 'Admins', icon: Users, perm: 'admins.manage' },
  { href: '/audit', label: 'Audit Log', icon: ScrollText, perm: 'audit.read' },
] as const;

export function Sidebar({ me }: SidebarProps) {
  const pathname = usePathname();
  const visible = NAV.filter((item) => me.permissions.includes(item.perm));

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card/60 backdrop-blur lg:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Game Hub</div>
          <div className="text-[11px] text-muted-foreground">Admin Panel</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visible.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 text-[11px] text-muted-foreground">
        <Settings2 className="mb-1 h-4 w-4" />
        Signed in as <span className="text-foreground">{me.email}</span>
        <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase">{me.role}</span>
      </div>
    </aside>
  );
}
