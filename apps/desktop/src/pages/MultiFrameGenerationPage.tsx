import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Cpu, Layers, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import HardwarePanel from '@/components/HardwarePanel';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';

/**
 * Multi-Frame Generation splits into two independent tools, each with its own
 * page. They are not variants of one flow: OptiFlow swaps the game's own
 * Streamline components and drops an unlocker beside the launcher, while
 * OptiScaler installs a separate drop-in with its own per-vendor profiles.
 * Sharing a page would mean sharing a wizard, and the two have no step in
 * common past "which game".
 *
 * Subscription-gated. The gate here is the UX half — both tools' download
 * endpoints enforce the same entitlement server-side, so skipping this screen
 * gets you a 403 rather than the files.
 */
const TOOLS = [
  {
    to: '/multi-frame-generation/optiscaler',
    icon: Wand2,
    titleKey: 'mfg.optiscaler.title',
    descKey: 'mfg.optiscaler.cardDescription',
    gpuKey: 'mfg.optiscaler.gpuSupport',
    accent: 'tool-accent-red',
  },
  {
    to: '/multi-frame-generation/optiflow',
    icon: Layers,
    titleKey: 'mfg.optiflow.title',
    descKey: 'mfg.optiflow.cardDescription',
    gpuKey: 'mfg.optiflow.gpuSupport',
    accent: 'tool-accent-green',
  },
] as const;

export default function MultiFrameGenerationPage() {
  const { t } = useTranslation();
  const access = useFeatureAccess('multi_frame_generation');

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('mfg.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('mfg.subtitle')}</p>
      </header>

      {access.allowed ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS.map(({ to, icon: Icon, titleKey, descKey, gpuKey, accent }) => (
              <Link
                key={to}
                to={to}
                // The accent class re-scopes --primary/--accent/--ring, so every
                // primary-coloured element below takes the tool's colour.
                className={cn(
                  accent,
                  'group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-all',
                  'hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/40 hover:shadow-lg',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                )}
              >
                <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="text-base font-semibold text-foreground">{t(titleKey)}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">{t(descKey)}</span>
                {/* Which cards the method needs — the difference between the
                    two tools that matters most before the user picks one. */}
                <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                  <Cpu aria-hidden className="size-3.5 shrink-0" />
                  {t(gpuKey)}
                </span>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-primary">
                  {t('mfg.open')}
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                </span>
              </Link>
            ))}
          </div>

          <HardwarePanel />
        </>
      ) : (
        <SubscriptionGate access={access} title={t('mfg.lockedTitle')} description={t('mfg.lockedHint')} />
      )}
    </div>
  );
}
