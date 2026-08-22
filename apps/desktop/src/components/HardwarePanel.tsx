import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Cpu, Gauge, HardDrive, Monitor, RefreshCw, ScanSearch } from 'lucide-react';
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
      <span className="min-w-0 truncate font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}

function Shell({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function HardwarePanel({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const status = useHardware((s) => s.status);
  const profile = useHardware((s) => s.profile);
  const source = useHardware((s) => s.source);
  const errorMessage = useHardware((s) => s.error);
  const detect = useHardware((s) => s.detect);
  const ensure = useHardware((s) => s.ensure);

  // Detect on first mount only when there is nothing fresh cached — the store
  // guards staleness, so navigating back here does not re-run a WMI sweep.
  useEffect(() => {
    void ensure();
  }, [ensure]);

  const busy = status === 'detecting';

  // Detecting with nothing to show yet: a spinner, not an empty panel.
  if (busy && !profile) {
    return (
      <Shell title={t('hardware.title')} icon={<ScanSearch aria-hidden className="size-4 text-primary" />}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner />
          {t('hardware.detecting')}
        </div>
      </Shell>
    );
  }

  // Failed with nothing cached. Say what went wrong instead of showing "—".
  if (status === 'error' && !profile) {
    return (
      <Shell
        title={t('hardware.title')}
        icon={<AlertTriangle aria-hidden className="size-4 text-destructive" />}
        action={
          <Button size="sm" onClick={() => void detect()} disabled={busy}>
            {busy ? <Spinner /> : <RefreshCw aria-hidden className="size-3.5" />}
            {t('hardware.retry')}
          </Button>
        }
      >
        <p className="text-xs text-destructive">{errorMessage ?? t('hardware.failed')}</p>
      </Shell>
    );
  }

  if (!profile) {
    return (
      <Shell
        title={t('hardware.title')}
        icon={<ScanSearch aria-hidden className="size-4 text-primary" />}
        action={
          <Button size="sm" onClick={() => void detect()} disabled={busy}>
            {busy ? <Spinner /> : <ScanSearch aria-hidden />}
            {busy ? t('hardware.detecting') : t('hardware.detect')}
          </Button>
        }
      >
        <p className="text-xs text-muted-foreground">
          {status === 'unsupported' ? t('hardware.unsupported') : t('hardware.notDetected')}
        </p>
      </Shell>
    );
  }

  // A browser-preview reading is a user agent and a screen size, not this
  // machine's hardware. Label it rather than badging it "Detected".
  const preview = source === 'browser';

  return (
    <Shell
      title={t('hardware.title')}
      icon={<Gauge aria-hidden className="size-4 text-primary" />}
      action={
        <div className="flex items-center gap-2">
          <Badge variant={preview ? 'secondary' : 'success'}>
            {preview ? t('hardware.previewOnly') : t('hardware.detected')}
          </Badge>
          <button
            type="button"
            aria-label={t('hardware.redetect')}
            title={t('hardware.redetect')}
            onClick={() => void detect()}
            disabled={busy}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {busy ? <Spinner /> : <RefreshCw aria-hidden className="size-3.5" />}
          </button>
        </div>
      }
    >
      {/* A refresh that failed keeps the previous reading on screen — say so. */}
      {status === 'error' && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
          {errorMessage ?? t('hardware.failed')}
        </p>
      )}
      {preview && <p className="text-xs text-muted-foreground">{t('hardware.previewHint')}</p>}

      <div className={compact ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-2 sm:grid-cols-2'}>
        {profile.cpu && <Row icon={<Cpu aria-hidden className="size-4" />} label={t('hardware.cpu')} value={profile.cpu} />}
        {gpuLabel(profile) && (
          <Row icon={<HardDrive aria-hidden className="size-4" />} label={t('hardware.gpu')} value={gpuLabel(profile)!} />
        )}
        {profile.vramMb != null && (
          <Row icon={<HardDrive aria-hidden className="size-4" />} label={t('hardware.vram')} value={`${profile.vramMb} MB`} />
        )}
        {profile.ramGb != null && <Row icon={<Gauge aria-hidden className="size-4" />} label={t('hardware.ram')} value={`${profile.ramGb} GB`} />}
        {profile.windowsVersion && (
          <Row icon={<Monitor aria-hidden className="size-4" />} label={t('hardware.windows')} value={profile.windowsVersion} />
        )}
        {profile.resolution && (
          <Row icon={<Monitor aria-hidden className="size-4" />} label={t('hardware.resolution')} value={profile.resolution} />
        )}
        {profile.driverVersion && (
          <Row icon={<HardDrive aria-hidden className="size-4" />} label={t('hardware.driver')} value={profile.driverVersion} />
        )}
      </div>
    </Shell>
  );
}
