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
  const hardwareSource = useHardware((s) => s.source);
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

  const displayName = user.username || user.email || user.phone || '';
  // Email first: accounts are email-only now, and phone is null on all of them.
  const identifier = user.email ?? user.phone ?? '';
  const active = sub?.isActive === true;
  const remaining = sub?.subscription ? daysLeft(sub.subscription.expirationDate) : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Banner. It used to be 64px of padding with a card pulled 48px back up
          over it, which on a wide window left a large empty field of gradient
          beside the name and nothing in it. The subscription state moved up
          here instead: it is the other thing this page is opened to check, and
          it fills the space with something worth reading. */}
      {/* Flat burgundy, not a three-stop gradient fading to 50%. A gradient
          across a header band has nothing to describe — no light source, no
          depth — and the faded end read as a printing error. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-primary px-6 py-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-background/90 text-base font-bold text-primary shadow-soft">
          {initialsOf(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-primary-foreground">{displayName}</p>
          {identifier && (
            <p dir="ltr" className="truncate text-xs text-primary-foreground/80">
              {identifier}
            </p>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-background/20 px-3 py-1 text-xs font-semibold text-primary-foreground ring-1 ring-inset ring-primary-foreground/25">
          <ShieldCheck aria-hidden className="size-3.5" />
          {active && remaining !== null ? t('profile.daysValue', { count: remaining }) : t('subscription.noActive')}
        </span>
      </div>

      {/* Device + subscription */}
      <div className="p-4">
        <div className="rounded-xl border border-border bg-background/60 p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <MonitorCog aria-hidden className="size-4 text-primary" />
            {t('profile.currentDevice')}
          </p>

          {/* A grid, not `justify-between`: with three items on a wide card
              that pushed them to the far corners and left two lakes of empty
              space in the middle. The device takes the slack; the subscription
              and its action stay together at the end where they belong. */}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            {/* Detected machine */}
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary">
                <Cpu aria-hidden className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 space-y-0.5">
                {/* A browser-preview reading has no GPU or CPU in it, so the
                    "graphics card not identified" line reads as a failed
                    detection rather than one that never ran natively. */}
                {hardware && hardwareSource === 'native' ? (
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
                ) : hardwareSource === 'browser' ? (
                  // Detection already ran and produced only browser data. Offering
                  // "Detect my PC" here is a button that visibly does nothing —
                  // say why instead.
                  <>
                    <p className="text-sm font-semibold">{t('profile.noHardware')}</p>
                    <p className="text-xs text-muted-foreground">{t('hardware.previewHint')}</p>
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
                  {/* Ink, not amber. The palette is burgundy and off-white;
                      a third colour here made a neutral fact look like a
                      warning. */}
                  <p className="text-xl font-extrabold tabular-nums leading-tight text-foreground">
                    {t('profile.daysValue', { count: remaining })}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('profile.untilExpiry')}</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{t('profile.subscribeHint')}</p>
              )}
            </div>

            <Link
              to="/subscription"
              className={cn(
                'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors',
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
      // A row that goes somewhere, on a page of white cards on an off-white
      // page. The darker control line and a border that answers on hover are
      // what tell it apart from the text beside it.
      className="flex items-center gap-3 rounded-xl border border-input bg-card px-4 py-3.5 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-accent hover:text-accent-foreground"
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
