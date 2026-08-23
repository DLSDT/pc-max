import MfgToolInstaller from '@/components/MfgToolInstaller';

/**
 * Streamline PC Max — the third Multi-Frame Generation tool.
 *
 * It installs through the same bounds-checked pipeline as the other two; what
 * differs is the published package. No separate installer exists for it.
 */
export default function StreamlinePcMaxPage() {
  return <MfgToolInstaller tool="streamline" />;
}
