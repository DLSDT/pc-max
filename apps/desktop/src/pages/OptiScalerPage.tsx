import MfgToolPage from '@/components/MfgToolPage';

/**
 * OptiScaler — the vendor-neutral drop-in.
 *
 * Three axes: which installer build, which Plan (the proxy DLL the game hooks
 * through), and which Order (the OptiScaler.ini profile). All of it lands in
 * the launcher folder, so nothing here drives a filesystem scan.
 */
export default function OptiScalerPage() {
  return (
    <MfgToolPage
      tool="optiscaler"
      accent="tool-accent-red"
      titleKey="mfg.optiscaler.title"
      subtitleKey="optiscaler.subtitle"
      notPublishedKey="mfg.optiscaler.notPublished"
      noComponentsKey="mfg.optiscaler.noComponents"
      gameHintKey="optiscaler.gameHint"
      installKey="optiscaler.install"
      removeKey="optiscaler.remove"
      removeHintKey="optiscaler.removeHint"
      confirmRemoveKey="optiscaler.confirmRemove"
      alreadyInstalledKey="optiscaler.alreadyInstalled"
      axes={[
        { component: 'installer', labelKey: 'optiscaler.installer', hintKey: 'optiscaler.installerHint', emptyKey: 'optiscaler.installerEmpty' },
        { component: 'plan', labelKey: 'optiscaler.plans', hintKey: 'optiscaler.plansHint', emptyKey: 'optiscaler.plansEmpty', expected: 8 },
        { component: 'order', labelKey: 'optiscaler.orders', hintKey: 'optiscaler.ordersHint', emptyKey: 'optiscaler.ordersEmpty', expected: 12 },
      ]}
    />
  );
}
