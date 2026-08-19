import { useTranslation } from 'react-i18next';
import HardwarePanel from '@/components/HardwarePanel';
import MyGamesPicker from '@/components/MyGamesPicker';

/**
 * Entry point for Multi-Frame Generation. Real content is the existing
 * hardware-aware package system on the game's detail page: GPU vendor is
 * detected here (HardwarePanel), packages are already filtered/recommended by
 * GPU vendor via `api.recommend()`, and installation is the existing
 * atomic-apply/backup/rollback flow (see GameDetailPage's PackagesSection).
 * This page's job is showing the detected GPU and getting the user to a game.
 */
export default function MultiFrameGenerationPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('mfg.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('mfg.subtitle')}</p>
      </header>

      <HardwarePanel />

      <MyGamesPicker />
    </div>
  );
}
