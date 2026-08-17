import { useTranslation } from 'react-i18next';
import { Cpu, Gauge, HardDrive, Monitor, RefreshCw, ScanSearch } from 'lucide-react';
import { useHardware } from '@/store/hardware';
import { gpuLabel } from '@/lib/hardware';
import { Button, Badge, Spinner } from '@/components/ui';

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function HardwarePanel({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { status, profile, detect } = useHardware();

  if (!profile) {
    return (
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ScanSearch aria-hidden className="size-4 text-primary" />
            {t('hardware.title')}
          </h2>
          <Button size="sm" onClick={() => void detect()} disabled={status === 'detecting'}>
            {status === 'detecting' ? <Spinner /> : <ScanSearch aria-hidden />}
            {status === 'detecting' ? t('hardware.detecting') : t('hardware.detect')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('hardware.notDetected')}</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge aria-hidden className="size-4 text-primary" />
          {t('hardware.title')}
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="success">{t('hardware.detected')}</Badge>
          <button
            type="button"
            aria-label={t('hardware.redetect')}
            onClick={() => void detect()}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {status === 'detecting' ? <Spinner /> : <RefreshCw aria-hidden className="size-3.5" />}
          </button>
        </div>
      </div>

      <div className={compact ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-2 sm:grid-cols-2'}>
        <Row icon={<Cpu aria-hidden className="size-4" />} label={t('hardware.cpu')} value={profile.cpu ?? '—'} />
        <Row icon={<HardDrive aria-hidden className="size-4" />} label={t('hardware.gpu')} value={gpuLabel(profile) ?? '—'} />
        {profile.vramMb != null && (
          <Row icon={<HardDrive aria-hidden className="size-4" />} label={t('hardware.vram')} value={`${profile.vramMb} MB`} />
        )}
        {profile.ramGb != null && <Row icon={<Gauge aria-hidden className="size-4" />} label={t('hardware.ram')} value={`${profile.ramGb} GB`} />}
        {profile.windowsVersion && <Row icon={<Monitor aria-hidden className="size-4" />} label={t('hardware.windows')} value={profile.windowsVersion} />}
        {profile.resolution && <Row icon={<Monitor aria-hidden className="size-4" />} label={t('hardware.resolution')} value={profile.resolution} />}
      </div>
    </section>
  );
}
