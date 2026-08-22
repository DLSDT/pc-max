import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Lock, RefreshCw, Sparkles } from 'lucide-react';
import { Button, Spinner, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { FeatureAccess } from '@/hooks/useFeatureAccess';

/**
 * What a gated page shows while it is not usable.
 *
 * Three distinct outcomes, kept apart because they need different actions:
 * still checking, the check failed (retry), and no subscription (subscribe).
 * Collapsing the middle one into "no subscription" would tell an offline
 * subscriber they need to pay again.
 */
export function SubscriptionGate({ access, title, description }: { access: FeatureAccess; title: string; description: string }) {
  const { t } = useTranslation();

  if (access.status === 'loading') {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <Spinner />
        {t('subscriptionGate.checking')}
      </div>
    );
  }

  if (access.status === 'error') {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle aria-hidden className="size-6" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">{t('subscriptionGate.checkFailedTitle')}</h2>
          <p className="text-sm text-muted-foreground">{access.error ?? t('subscriptionGate.checkFailedHint')}</p>
        </div>
        <Button onClick={() => void access.refresh()}>
          <RefreshCw aria-hidden className="size-4" />
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-5 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Lock aria-hidden className="size-7" />
      </span>
      <div className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="text-balance text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col items-center gap-2.5">
        <Link
          to="/subscription"
          className={cn(buttonVariants(), 'h-11 px-6 text-sm font-semibold')}
        >
          <Sparkles aria-hidden className="size-4" />
          {t('subscriptionGate.viewPlans')}
        </Link>
        <button
          type="button"
          onClick={() => void access.refresh()}
          className="rounded text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('subscriptionGate.recheck')}
        </button>
      </div>
    </div>
  );
}
