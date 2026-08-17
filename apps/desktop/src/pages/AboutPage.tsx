import { useTranslation } from 'react-i18next';
import { Gamepad2, Layers, RefreshCw } from 'lucide-react';
import { config } from '@/lib/config';

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-glow [&_svg]:size-7">
          <Gamepad2 aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('about.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('settings.version', { version: config.appVersion })}</p>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{t('about.description')}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('about.tagline')}</p>

      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Layers aria-hidden className="size-4 text-primary" />
          Architecture
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <RefreshCw aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            Content is delivered from the API — new games and optimization profiles appear without an app update.
          </li>
          <li className="flex items-start gap-2">
            <Layers aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            Everything is cached locally and keeps working offline; background sync refreshes on reconnect.
          </li>
        </ul>
      </div>
    </div>
  );
}
