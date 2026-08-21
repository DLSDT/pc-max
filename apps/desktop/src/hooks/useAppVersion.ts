import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getRuntimeAppVersion } from '@/lib/config';
import { useUi } from '@/store/ui';
import { compareVersions, installNativeUpdate, isTauriShell } from '@/lib/updater';

/**
 * Check the release manifest once per boot and surface:
 *  - "update available" (a newer release exists), and
 *  - "update required" (the running version is below the server's mandatory
 *    minimum from /config → min_app_version — blocking banner in the layout).
 *
 * When the user has auto-update on (the default), a found update is downloaded
 * and installed here instead of only being announced. Only in the packaged
 * shell — there is nothing to install in the browser preview — and failures
 * stay silent, leaving the manual "update available" affordance in place.
 */
export function useAppVersionCheck() {
  const setUpdateAvailable = useUi((s) => s.setUpdateAvailable);
  const setUpdateRequired = useUi((s) => s.setUpdateRequired);
  const autoUpdate = useUi((s) => s.autoUpdate);

  useQuery({
    queryKey: ['app-version'],
    queryFn: async () => {
      const runningVersion = await getRuntimeAppVersion();
      const [res, cfg] = await Promise.all([
        api.appVersion(runningVersion),
        api.remoteConfig().catch(() => null),
      ]);
      setUpdateAvailable(res.updateAvailable);

      if (res.updateAvailable && autoUpdate && isTauriShell()) {
        // Resolves only if the install fails — a successful one relaunches.
        void installNativeUpdate();
      }
      const min = (cfg?.data?.min_app_version as { version?: string } | undefined)?.version;
      if (min && compareVersions(runningVersion, min) < 0) {
        setUpdateRequired(true);
      }
      return res;
    },
    retry: 0,
    staleTime: Infinity,
  });
}
