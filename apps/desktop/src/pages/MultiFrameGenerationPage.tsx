import { useTranslation } from 'react-i18next';
import HardwarePanel from '@/components/HardwarePanel';
import MyGamesPicker from '@/components/MyGamesPicker';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';

/**
 * Entry point for Multi-Frame Generation. Real content is the existing
 * hardware-aware package system on the game's detail page: GPU vendor is
 * detected here (HardwarePanel), packages are already filtered/recommended by
 * GPU vendor via `api.recommend()`, and installation is the existing
 * atomic-apply/backup/rollback flow (see GameDetailPage's PackagesSection).
 * This page's job is showing the detected GPU and getting the user to a game.
 *
 * Subscription-gated. The gate here is the UX half — the package download
 * endpoint enforces the same entitlement server-side, so skipping this screen
 * gets you a 403 rather than the files.
 */
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
          <HardwarePanel />
          <MyGamesPicker />
        </>
      ) : (
        <SubscriptionGate access={access} title={t('mfg.lockedTitle')} description={t('mfg.lockedHint')} />
      )}
    </div>
  );
}
