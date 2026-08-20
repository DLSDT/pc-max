import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Cpu, MonitorCog, ShieldCheck, Sparkles } from 'lucide-react';
import type { MySubscription } from '@goh/types';
import { useAuth } from '@/store/auth';
import { useHardware } from '@/store/hardware';
import { getSubscription } from '@/lib/subscription';
import { formatDate } from '@/lib/labels';
import { cn } from '@/lib/utils';

/**
 * Account hero: who you are, what machine PC MAX is tuned for, and how long
 * the subscription has left — the three things a user opens this page to check.
 *
 * The device card deliberately shows the DETECTED PC rather than an abstract
 * "device" row: on a desktop optimizer the hardware is the thing every
 * recommendation keys off, so it is what belongs next to the subscription.
 */

/** Whole days left, floored, never negative. */
function daysLeft(expiration: string): number {
  const ms = new Date(expiration).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function initialsOf(label: string): string {
  const trimmed = label.replace(/^\+/, '').trim();
  return trimmed.slice(0, 2).toUpperCase();
}

export default function ProfileHeader() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const hardware = useHardware((s) => s.profile);
  const detect = useHardware((s) => s.detect);
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void getSubscription().then((s) => !cancelled && setSub(s));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  const displayName = user.username || user.phone || user.email || '';
  const identifier = user.phone ?? user.email ?? '';
  const active = sub?.isActive === true;
  const remaining = sub?.subscription ? daysLeft(sub.subscription.expirationDate) : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Banner */}
      <div className="relative bg-gradient-to-br from-primary via-primary/80 to-primary/40 px-6 pb-16 pt-6">
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-background/90 text-lg font-bold text-primary shadow-glow-sm">
            {initialsOf(displayName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-primary-foreground">{displayName}</p>
            {identifier && (
              <p dir="ltr" className="truncate text-sm text-primary-foreground/80">
                {identifier}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Device + subscription card, overlapping the banner */}
      <div className="-mt-12 px-4 pb-4">
        <div className="rounded-xl border border-border bg-background/95 p-5 shadow-lg backdrop-blur">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <MonitorCog aria-hidden className="size-4 text-primary" />
            {t('profile.currentDevice')}
          </p>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            {/* Detected machine */}
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary">
                <Cpu aria-hidden className="size-6 text-muted-foreground" />
              </div>
              <div className="min-w-0 space-y-0.5">
                {hardware ? (
                  <>
                    <p className="truncate text-sm font-semibold">{hardware.gpuModel ?? t('profile.unknownGpu')}</p>
                    <p className="truncate text-xs text-muted-foreground">{hardware.cpu ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        hardware.ramGb ? t('profile.ramGb', { gb: hardware.ramGb }) : null,
                        hardware.windowsVersion,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold">{t('profile.noHardware')}</p>
                    <button
                      type="button"
                      disabled={detecting}
                      onClick={() => {
                        setDetecting(true);
                        void detect().finally(() => setDetecting(false));
                      }}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
                    >
                      {detecting ? t('common.loading') : t('profile.detectNow')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Days remaining */}
            <div className="text-center sm:text-start">
              {active && remaining !== null ? (
                <>
                  <p className="text-2xl font-bold tabular-nums text-amber-500">{t('profile.daysValue', { count: remaining })}</p>
                  <p className="text-xs text-muted-foreground">{t('profile.untilExpiry')}</p>
                </>
              ) : (
                <>
                  <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground sm:justify-start">
                    <ShieldCheck aria-hidden className="size-4" />
                    {t('subscription.noActive')}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('profile.subscribeHint')}</p>
                </>
              )}
            </div>

            <Link
              to="/subscription"
              className={cn(
                'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border px-5 text-sm font-medium transition-colors',
                active
                  ? 'border-border hover:bg-accent'
                  : 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              <Sparkles aria-hidden className="size-4" />
              {active ? t('profile.renew') : t('subscription.subscribe')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A single row in the account menu. */
export function ProfileMenuItem({
  to,
  icon,
  label,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-medium transition-colors hover:bg-accent"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary [&_svg]:size-4">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">{badge}</span>
      )}
      <ChevronLeft aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:rotate-0 ltr:rotate-180" />
    </Link>
  );
}
