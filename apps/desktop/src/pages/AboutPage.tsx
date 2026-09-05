import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, RefreshCw } from 'lucide-react';
import { config, getRuntimeAppVersion } from '@/lib/config';

export default function AboutPage() {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState<string>(config.appVersion);

  useEffect(() => {
    void getRuntimeAppVersion().then(setAppVersion);
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <img src="/icon.png" alt={t('appName')} className="size-14 rounded-2xl object-contain shadow-sm" draggable={false} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('appName')}</h1>
          <p className="text-xs text-muted-foreground">{t('settings.version', { version: appVersion })}</p>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{t('about.description')}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('about.tagline')}</p>

      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Layers aria-hidden className="size-4 text-primary" />
          {t('about.architecture')}
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <RefreshCw aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            {t('about.architectureServerDriven')}
          </li>
          <li className="flex items-start gap-2">
            <Layers aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            {t('about.architectureOffline')}
          </li>
        </ul>
      </div>
    </div>
  );
}
