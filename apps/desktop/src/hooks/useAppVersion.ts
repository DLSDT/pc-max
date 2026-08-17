import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import { useUi } from '@/store/ui';

/** Check the release manifest once per boot and surface "update available". */
export function useAppVersionCheck() {
  const setUpdateAvailable = useUi((s) => s.setUpdateAvailable);

  useQuery({
    queryKey: ['app-version'],
    queryFn: async () => {
      const res = await api.appVersion(config.appVersion);
      setUpdateAvailable(res.updateAvailable);
      return res;
    },
    retry: 0,
    staleTime: Infinity,
  });
}
