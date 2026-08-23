import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FolderOpen,
  Loader2,
  PackageCheck,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { MfgToolStatusResponse } from '@goh/types';
import ChoiceGrid from '@/components/ChoiceGrid';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { api, ApiError } from '@/lib/api';
import { isTauriShell } from '@/lib/optimizer';
import {
  installTool,
  pickGameExecutable,
  scanGame,
  statusErrorFor,
  uninstallTool,
  type FetchProgress,
  type InstallReport,
  type ScanReport,
  type UninstallReport,
} from '@/lib/optiflow';
import { clearInstall, getInstall, recordInstall, type OptiScalerInstall } from '@/lib/optiscalerInstalls';
import { cn } from '@/lib/utils';

/** How many the product ships; used only to tell the user when fewer are published. */
const EXPECTED_PLANS = 8;
const EXPECTED_ORDERS = 12;

type Stage = 'idle' | 'scanning' | 'installing' | 'removing';

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'warn' | 'error' | 'ok';
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  const styles = {
    info: 'border-border bg-muted/40 text-muted-foreground',
    warn: 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400',
    error: 'border-destructive/30 bg-destructive/5 text-destructive',
    ok: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
  }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${styles}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * OptiScaler — configure, then install.
 *
 * The sequence is deliberate: installer, Plan, Order, game, install. Each
 * choice is a real published package component, and the Install button stays
 * disabled until every group that HAS choices has one, so the user can never
 * reach an install that silently drops half of what they picked.
 *
 * Removal is driven entirely by the record written at install time, never by
 * matching filenames — see `lib/optiscalerInstalls.ts`.
 */
export default function OptiScalerPage() {
  const { t } = useTranslation();
  const access = useFeatureAccess('multi_frame_generation');

  const [status, setStatus] = useState<MfgToolStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [step, setStep] = useState<string | null>(null);
  const [progress, setProgress] = useState<FetchProgress | null>(null);

  const [installer, setInstaller] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [order, setOrder] = useState<string | null>(null);

  const [exePath, setExePath] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanReport | null>(null);
  const [existing, setExisting] = useState<OptiScalerInstall | null>(null);
  const [result, setResult] = useState<InstallReport | null>(null);
  const [removed, setRemoved] = useState<UninstallReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .mfgToolStatus('optiscaler')
      .then((res) => alive && setStatus(res))
      .catch((err) => {
        if (!alive) return;
        const e = statusErrorFor(err);
        setStatusError('key' in e ? t(e.key) : e.message);
      });
    return () => {
      alive = false;
    };
  }, [t]);

  const busy = stage !== 'idle';
  const installers = status?.installers ?? [];
  const plans = status?.plans ?? [];
  const orders = status?.orders ?? [];

  // A group only counts as "chosen" when it actually offers something.
  const missing = useMemo(() => {
    const m: string[] = [];
    if (installers.length > 0 && !installer) m.push(t('optiscaler.installer'));
    if (plans.length > 0 && !plan) m.push(t('optiscaler.plans'));
    if (orders.length > 0 && !order) m.push(t('optiscaler.orders'));
    if (!exePath) m.push(t('optiscaler.game'));
    else if (!scan) m.push(t('optiscaler.validGamePath'));
    return m;
  }, [installers.length, plans.length, orders.length, installer, plan, order, exePath, scan, t]);

  const canInstall = Boolean(status?.available) && missing.length === 0 && isTauriShell() && !busy;

  const chooseGame = useCallback(async () => {
    setError(null);
    setResult(null);
    setRemoved(null);
    try {
      const picked = await pickGameExecutable();
      if (!picked) return;
      setExePath(picked);
      setStage('scanning');
      setStep(t('optiscaler.stepLocating'));
      const report = await scanGame(picked, []);
      setScan(report);
      setExisting(getInstall(report.gameDir));
    } catch (err) {
      setScan(null);
      setExisting(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStage('idle');
      setStep(null);
    }
  }, [t]);

  const runInstall = useCallback(async () => {
    if (!exePath || !scan) return;
    setError(null);
    setRemoved(null);
    setStage('installing');
    try {
      setStep(t('optiscaler.stepPreparing'));
      const report = await installTool({
        tool: 'optiscaler',
        exePath,
        variant: { installer, plan, order },
        onProgress: (p) => {
          setStep(t('optiscaler.stepDownloading'));
          setProgress(p);
        },
      });
      setStep(t('optiscaler.stepVerifying'));

      const entry: OptiScalerInstall = {
        gameDir: report.gameDir,
        launcherDir: report.launcherDir,
        exePath,
        version: status?.package?.version ?? '—',
        installer,
        plan,
        order,
        installedAt: new Date().toISOString(),
        backupDir: report.backupDir,
        files: report.written.map((w) => ({ path: w.path, replaced: w.replaced })),
      };
      // Record before reporting success: without it, Remove cannot identify
      // these files later and would have nothing safe to act on.
      try {
        recordInstall(entry);
      } catch {
        setError(t('optiscaler.recordFailed'));
      }
      setExisting(entry);
      setResult(report);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : String(err));
    } finally {
      setStage('idle');
      setStep(null);
      setProgress(null);
    }
  }, [exePath, scan, installer, plan, order, status, t]);

  const runRemove = useCallback(async () => {
    if (!existing) return;
    setError(null);
    setResult(null);
    setStage('removing');
    try {
      setStep(t('optiscaler.stepRemoving'));
      const report = await uninstallTool({
        gameDir: existing.gameDir,
        backupDir: existing.backupDir,
        files: existing.files,
      });
      setRemoved(report);
      // Keep the record when something could not be undone — it is the only
      // handle on the files that are still there.
      if (report.failed.length === 0) {
        clearInstall(existing.gameDir);
        setExisting(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStage('idle');
      setStep(null);
      setConfirmRemove(false);
    }
  }, [existing, t]);

  if (!access.allowed) {
    return (
      <div className="tool-accent-red space-y-6">
        <BackLink />
        <SubscriptionGate access={access} title={t('mfg.lockedTitle')} description={t('mfg.lockedHint')} />
      </div>
    );
  }

  return (
    <div className="tool-accent-red space-y-6">
      <BackLink />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('mfg.optiscaler.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('optiscaler.subtitle')}</p>
      </header>

      {!isTauriShell() && <Notice tone="warn" icon={AlertTriangle}>{t('mfg.desktopOnly')}</Notice>}
      {statusError && <Notice tone="warn" icon={AlertTriangle}>{statusError}</Notice>}
      {status && !status.available && <Notice tone="warn" icon={AlertTriangle}>{t('mfg.optiscaler.notPublished')}</Notice>}
      {status?.available && (
        <p className="text-xs text-muted-foreground">
          {t('mfg.packageVersion', { name: status.package?.name ?? 'OptiScaler', version: status.package?.version ?? '—' })}
          {status.baseFileCount > 0 && ` · ${t('optiscaler.baseFiles', { count: status.baseFileCount })}`}
        </p>
      )}

      {/* 1 — Opti Installer */}
      <ChoiceGrid
        label={t('optiscaler.installer')}
        hint={t('optiscaler.installerHint')}
        choices={installers}
        value={installer}
        onChange={setInstaller}
        disabled={busy}
        emptyMessage={t('optiscaler.installerEmpty')}
      />

      {/* 2 — Opti Plans */}
      <ChoiceGrid
        label={t('optiscaler.plans')}
        hint={t('optiscaler.plansHint')}
        choices={plans}
        value={plan}
        onChange={setPlan}
        disabled={busy}
        expected={EXPECTED_PLANS}
        emptyMessage={t('optiscaler.plansEmpty')}
      />

      {/* 3 — Opti Orders */}
      <ChoiceGrid
        label={t('optiscaler.orders')}
        hint={t('optiscaler.ordersHint')}
        choices={orders}
        value={order}
        onChange={setOrder}
        disabled={busy}
        expected={EXPECTED_ORDERS}
        emptyMessage={t('optiscaler.ordersEmpty')}
      />

      {/* 4 — Game */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('optiscaler.game')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('optiscaler.gameHint')}</p>
        <button
          type="button"
          onClick={chooseGame}
          disabled={busy || !isTauriShell()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stage === 'scanning' ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FolderOpen aria-hidden className="size-4" />}
          {exePath ? t('mfg.chooseAnother') : t('mfg.chooseExe')}
        </button>

        {exePath && <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{exePath}</p>}

        {scan && (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('mfg.gameFolder')}</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-foreground">{scan.gameDir}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('mfg.launcherFolder')}</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-foreground">{scan.launcherDir}</dd>
            </div>
          </dl>
        )}

        {existing && (
          <div className="mt-4">
            <Notice tone="ok" icon={PackageCheck}>
              {t('optiscaler.alreadyInstalled', {
                version: existing.version,
                when: new Date(existing.installedAt).toLocaleString(),
              })}
              <span className="mt-1 block font-mono text-xs opacity-80" dir="ltr">
                {[existing.installer, existing.plan, existing.order].filter(Boolean).join(' · ') || '—'}
              </span>
            </Notice>
          </div>
        )}
      </section>

      {/* 5 — Install */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('optiscaler.install')}</h2>
        <Notice tone="info" icon={ShieldCheck}>{t('mfg.backupNote')}</Notice>

        {missing.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">{t('optiscaler.stillNeeded', { items: missing.join('، ') })}</p>
        )}

        <button
          type="button"
          onClick={runInstall}
          disabled={!canInstall}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stage === 'installing' && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {existing ? t('optiscaler.reinstall') : t('optiscaler.install')}
        </button>

        {step && (
          <p className="mt-3 text-xs text-muted-foreground">
            {step}
            {progress && ` — ${progress.filename} (${progress.index + 1}/${progress.total})`}
          </p>
        )}
      </section>

      {error && <Notice tone="error" icon={AlertTriangle}>{error}</Notice>}

      {result && (
        <section className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 aria-hidden className="size-5 text-emerald-500" />
            <h2 className="text-sm font-semibold text-foreground">{t('mfg.installed', { count: result.written.length })}</h2>
          </div>
          <ul className="space-y-1">
            {result.written.map((w) => (
              <li key={w.path} className="break-all font-mono text-xs text-muted-foreground">
                {w.replaced ? '↻' : '+'} {w.path}
              </li>
            ))}
          </ul>
          <p className="break-all text-xs text-muted-foreground">
            {t('mfg.backupAt')} <span className="font-mono">{result.backupDir}</span>
          </p>
        </section>
      )}

      {/* 6 — Remove */}
      {existing && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t('optiscaler.remove')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('optiscaler.removeHint')}</p>

          {!confirmRemove ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 aria-hidden className="size-4" />
              {t('optiscaler.remove')}
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <Notice tone="warn" icon={AlertTriangle}>
                {t('optiscaler.confirmRemove', { count: existing.files.length })}
              </Notice>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runRemove}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {stage === 'removing' && <Loader2 aria-hidden className="size-4 animate-spin" />}
                  {t('optiscaler.confirmRemoveYes')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  disabled={busy}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {removed && (
        <section
          className={cn(
            'space-y-3 rounded-xl border p-5',
            removed.failed.length === 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5',
          )}
        >
          <h2 className="text-sm font-semibold text-foreground">
            {removed.failed.length === 0
              ? t('optiscaler.removeDone', { restored: removed.restored.length, removed: removed.removed.length })
              : t('optiscaler.removePartial', { failed: removed.failed.length })}
          </h2>
          {removed.failed.length > 0 && (
            <ul className="space-y-1">
              {removed.failed.map((f) => (
                <li key={f.filename} className="break-all text-xs text-muted-foreground">
                  <span className="font-mono">{f.filename}</span> — {f.reason}
                </li>
              ))}
            </ul>
          )}
          {removed.missing.length > 0 && (
            <p className="text-xs text-muted-foreground">{t('optiscaler.alreadyGone', { count: removed.missing.length })}</p>
          )}
        </section>
      )}
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link
      to="/multi-frame-generation"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
      {t('mfg.title')}
    </Link>
  );
}
