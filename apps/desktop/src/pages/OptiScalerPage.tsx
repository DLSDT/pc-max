import MfgToolInstaller from '@/components/MfgToolInstaller';

/** OptiScaler — installs the drop-in beside the game's executable. Uses the
 *  same bounds-checked installer as OptiFlow; the per-vendor order profiles
 *  are selected by which package the admin publishes. */
export default function OptiScalerPage() {
  return <MfgToolInstaller tool="optiscaler" />;
}
