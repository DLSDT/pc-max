import MfgToolInstaller from '@/components/MfgToolInstaller';

/** OptiFlow — replaces the game's Streamline components and drops the
 *  unlocker beside the launcher. The flow itself is shared with OptiScaler;
 *  what differs is the published manifest. */
export default function OptiFlowPage() {
  return <MfgToolInstaller tool="optiflow" />;
}
