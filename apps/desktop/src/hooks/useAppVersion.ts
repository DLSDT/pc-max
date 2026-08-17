import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import { useUi } from '@/store/ui';
import { compareVersions } from '@/lib/updater';

/**
 * Check the release manifest once per boot and surface:
 *  - "update available" (a newer release exists), and
 *  - "update required" (the running version is below the server's mandatory
 *    minimum from /config → min_app_version — blocking banner in the layout).
 */
export function useAppVersionCheck() {
  const setUpdateAvailable = useUi((s) => s.setUpdateAvailable);
  const setUpdateRequired = useUi((s) => s.setUpdateRequired);

  useQuery({
    queryKey: ['app-version'],
    queryFn: async () => {
      const [res, cfg] = await Promise.all([
        api.appVersion(config.appVersion),
        api.remoteConfig().catch(() => null),
      ]);
      setUpdateAvailable(res.updateAvailable);
      const min = (cfg?.data?.min_app_version as { version?: string } | undefined)?.version;
      if (min && compareVersions(config.appVersion, min) < 0) {
        setUpdateRequired(true);
      }
      return res;
    },
    retry: 0,
    staleTime: Infinity,
  });
}
