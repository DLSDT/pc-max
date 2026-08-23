import MfgToolPage from '@/components/MfgToolPage';
import { supportsOpticalFlow } from '@/lib/gpuProfile';

/**
 * AI Optical Flow — an Unlocker beside the launcher, plus a Streamline package
 * that replaces the game's own components wherever they are.
 *
 * The Streamline axis drives the scan: which of the game's files get replaced
 * depends on which package the user picked.
 */
export default function AiOpticalFlowPage() {
  return (
    <MfgToolPage
      tool="optiflow"
      accent="tool-accent-green"
      titleKey="mfg.optiflow.title"
      subtitleKey="aof.subtitle"
      notPublishedKey="mfg.optiflow.notPublished"
      noComponentsKey="mfg.optiflow.noComponents"
      gameHintKey="mfg.optiflow.step1Hint"
      installKey="aof.install"
      removeKey="aof.remove"
      removeHintKey="aof.removeHint"
      confirmRemoveKey="aof.confirmRemove"
      alreadyInstalledKey="aof.alreadyInstalled"
      requirementKey="mfg.optiflow.gpuSupport"
      gpuCheck={supportsOpticalFlow}
      unsupportedGpuKey="mfg.optiflow.unsupportedGpu"
      axes={[
        { component: 'unlocker', labelKey: 'aof.unlocker', hintKey: 'aof.unlockerHint', emptyKey: 'aof.unlockerEmpty', expected: 3 },
        { component: 'streamline', labelKey: 'aof.streamline', hintKey: 'aof.streamlineHint', emptyKey: 'aof.streamlineEmpty', expected: 4, drivesScan: true },
      ]}
    />
  );
}
