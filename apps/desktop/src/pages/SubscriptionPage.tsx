import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Globe, Loader2, Mail, MessageCircle, Monitor, ShieldCheck, X } from 'lucide-react';
import type { MySubscription, SubscriptionPlanPublic } from '@goh/types';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button, Badge, Skeleton } from '@/components/ui';
import { formatDateTime } from '@/lib/labels';
import { invalidateSubscriptionCache, getSubscription } from '@/lib/subscription';
import { openExternal } from '@/lib/openExternal';
import { cn } from '@/lib/utils';

interface SupportInfo {
  email?: string | null;
  telegram?: string | null;
  website?: string | null;
}

export default function SubscriptionPage() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const [plans, setPlans] = useState<SubscriptionPlanPublic[] | null>(null);
  const [mine, setMine] = useState<MySubscription | null>(null);
  const [devices, setDevices] = useState<{ id: string; name: string | null; createdAt: string }[] | null>(null);
  const [support, setSupport] = useState<SupportInfo | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [plansRes, subRes] = await Promise.all([api.plans(), getSubscription(true)]);
      setPlans(plansRes.data);
      setMine(subRes);
      setDevices((await api.myDevices()).data);
    } catch {
      setError(t('auth.errorGeneric'));
    }
  }, [t]);

  useEffect(() => {
    api
      .remoteConfig()
      .then((res) => setSupport((res.data.support as SupportInfo | undefined) ?? {}))
      .catch(() => setSupport({}));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function subscribe(plan: SubscriptionPlanPublic) {
    setBusyId(plan.id);
    setError(null);
    setSuccess(false);
    try {
      const idempotencyKey = `desktop-${user?.id}-${plan.id}-${Date.now()}`;
      const res = await api.purchase({ planId: plan.id, idempotencyKey });
      if (res.redirectUrl) {
        setWaiting(true);
        // Sandbox/dev: the mock provider callback completes immediately.
        if (res.provider === 'mock') {
          await api.completePayment(res.provider, res.paymentId);
          invalidateSubscriptionCache();
          setWaiting(false);
          setSuccess(true);
          await load();
        } else {
          // Real provider: hand the payment page to the system browser and let
          // the user complete it there. This has to go through the opener
          // plugin — `window.open` is a silent no-op in the Tauri webview, so
          // the gateway never opened and this screen waited forever.
          try {
            await openExternal(res.redirectUrl);
          } catch {
            setWaiting(false);
            setError(t('subscription.openGatewayFailed'));
            return;
          }
          pollUntilActive();
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  }

  async function pollUntilActive() {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const sub = await getSubscription(true).catch(() => null);
      if (sub?.isActive) {
        setWaiting(false);
        setSuccess(true);
        await load();
        return;
      }
    }
    setWaiting(false);
  }

  const activePlan = mine?.subscription;
  const expired = activePlan ? new Date(activePlan.expirationDate) < new Date() : false;

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-muted-foreground">{t('auth.signInRequired')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('subscription.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subscription.hint')}</p>
      </div>

      {/* Current subscription */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck aria-hidden className="size-4 text-primary" />
          {t('subscription.current')}
        </h2>
        {!mine ? (
          <Skeleton className="h-10 w-64" />
        ) : activePlan ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={expired ? 'warning' : 'success'}>
              {expired ? t('subscription.expired') : mine.isActive ? t('subscription.active') : activePlan.status}
            </Badge>
            <span className="font-medium">{activePlan.plan.name}</span>
            <span className="text-muted-foreground">
              {t('subscription.expiresOn', { date: formatDateTime(activePlan.expirationDate) })}
            </span>
            <div className="flex flex-wrap gap-1">
              {mine.entitlements.map((en) => (
                <Badge key={en.feature} variant="outline">{en.feature}</Badge>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('subscription.noActive')}</p>
        )}

        {success && <p className="text-sm text-emerald-400">{t('subscription.purchaseSuccess')}</p>}
        {waiting && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('subscription.waitingForPayment')}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      {/* Plans */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t('subscription.plans')}</h2>
        {!plans ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  'flex flex-col rounded-xl border bg-card p-5 transition-colors',
                  mine?.subscription?.plan.id === plan.id ? 'border-primary/50' : 'border-border',
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{plan.name}</h3>
                  {mine?.subscription?.plan.id === plan.id && <Badge variant="default">{t('subscription.currentPlan')}</Badge>}
                </div>
                <div className="mt-2 text-2xl font-bold">
                  {plan.price.toLocaleString('en-US')}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">{plan.currency}</span>
                </div>
                <p className="text-xs text-muted-foreground">{plan.durationDays} {t('subscription.days')}</p>

                <ul className="mt-4 flex-1 space-y-1.5 text-xs text-muted-foreground">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Check aria-hidden className="size-3.5 text-emerald-400" />
                      {t(`subscription.feature.${f}`, { defaultValue: f })}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Monitor aria-hidden className="size-3" />
                    {plan.deviceLimit} {t('subscription.devices')}
                  </span>
                </div>

                <Button
                  className="mt-3 w-full"
                  size="sm"
                  disabled={busyId !== null || mine?.isActive === true}
                  onClick={() => void subscribe(plan)}
                >
                  {busyId === plan.id ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
                  {mine?.isActive ? t('subscription.active') : t('subscription.subscribe')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Devices */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">{t('subscription.myDevices')}</h2>
        {devices === null ? (
          <Skeleton className="h-8 w-48" />
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('subscription.noDevices')}</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2">
                  <Monitor aria-hidden className="size-4 text-muted-foreground" />
                  {d.name ?? d.id.slice(0, 12)}
                  <span className="text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</span>
                </span>
                <button
                  type="button"
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={t('subscription.removeDevice')}
                  onClick={async () => {
                    await api.revokeDevice(d.id);
                    await load();
                  }}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {t('subscription.deviceHint')}
          {waiting && (
            <span className="inline-flex items-center gap-1">
              <ExternalLink aria-hidden className="size-3" /> {t('subscription.paymentWindowHint')}
            </span>
          )}
        </p>
      </section>

      {/* Contact Support — admin-configured, never a hardcoded address in the client */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle aria-hidden className="size-4 text-primary" />
          {t('subscription.support')}
        </h2>
        {support === null ? (
          <Skeleton className="h-8 w-48" />
        ) : support.email || support.telegram || support.website ? (
          <div className="flex flex-wrap gap-2">
            {support.email && (
              <a
                href={`mailto:${support.email}`}
                dir="ltr"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/40 px-3 text-xs font-medium transition-colors hover:bg-accent"
              >
                <Mail aria-hidden className="size-3.5 text-primary" />
                {support.email}
              </a>
            )}
            {support.telegram && (
              <a
                href={support.telegram.startsWith('http') ? support.telegram : `https://t.me/${support.telegram.replace(/^@/, '')}`}
                // target="_blank" does nothing in the Tauri webview; the link
                // has to be handed to the OS explicitly.
                onClick={(e) => {
                  e.preventDefault();
                  void openExternal(e.currentTarget.href);
                }}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/40 px-3 text-xs font-medium transition-colors hover:bg-accent"
              >
                <MessageCircle aria-hidden className="size-3.5 text-primary" />
                {support.telegram}
              </a>
            )}
            {support.website && (
              <a
                href={support.website}
                onClick={(e) => {
                  e.preventDefault();
                  void openExternal(e.currentTarget.href);
                }}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/40 px-3 text-xs font-medium transition-colors hover:bg-accent"
              >
                <Globe aria-hidden className="size-3.5 text-primary" />
                {support.website}
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('subscription.supportUnavailable')}</p>
        )}
      </section>
    </div>
  );
}
