import MfgToolPage from '@/components/MfgToolPage';
import { supportsStreamlinePcMax } from '@/lib/gpuProfile';

/**
 * Streamline PC Max — replaces the game's Streamline files, nothing else.
 *
 * Its hardware floor is narrower than AI Optical Flow's: RTX 40 and 50 only.
 * The requirement is stated before any detection runs, so a user whose card was
 * not detected still learns what the tool needs.
 */
export default function StreamlinePcMaxPage() {
  return (
    <MfgToolPage
      tool="streamline"
      accent="tool-accent-blue"
      titleKey="mfg.streamline.title"
      subtitleKey="streamline.subtitle"
      notPublishedKey="streamline.notPublished"
      noComponentsKey="streamline.noComponents"
      gameHintKey="streamline.gameHint"
      installKey="streamline.install"
      removeKey="streamline.remove"
      removeHintKey="streamline.removeHint"
      confirmRemoveKey="streamline.confirmRemove"
      alreadyInstalledKey="streamline.alreadyInstalled"
      requirementKey="streamline.requires4050"
      gpuCheck={supportsStreamlinePcMax}
      unsupportedGpuKey="streamline.unsupportedGpu"
      axes={[
        { component: 'streamline', labelKey: 'aof.streamline', hintKey: 'streamline.pickHint', emptyKey: 'streamline.pickEmpty', expected: 4, drivesScan: true },
      ]}
    />
  );
}
