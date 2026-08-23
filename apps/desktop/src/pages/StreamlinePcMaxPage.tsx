import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, CheckCircle2, Cpu, FolderOpen, Loader2, PackageCheck, ShieldCheck, Trash2 } from 'lucide-react';
import type { MfgToolStatusResponse } from '@goh/types';
import ChoiceGrid from '@/components/ChoiceGrid';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { api, ApiError } from '@/lib/api';
import { isTauriShell } from '@/lib/optimizer';
import { gpuLabel } from '@/lib/hardware';
import { supportsStreamlinePcMax } from '@/lib/gpuProfile';
import { useHardware } from '@/store/hardware';
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
import { clearInstall, getInstall, recordInstall, type MfgInstall } from '@/lib/mfgInstalls';
import { cn } from '@/lib/utils';

/** How many builds the tool ships with; used only to say when fewer are published. */
const EXPECTED_STREAMLINES = 4;

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
 * AI Optical Flow — choose an Unlocker, choose a Streamline package, choose the
 * game, install.
 *
 * The two steps the installer performs are already the native layer's two file
 * roles, so nothing here re-implements them: the Unlocker is a `launcher` file
 * (written beside the executable the user picked) and the Streamline package is
 * `streamline` files (each replacing the game's own copy wherever the recursive
 * scan finds it, at every location, with the original backed up first). A
 * component the game does not ship is reported, never created.
 *
 * Removal reads the record written at install time and undoes exactly that —
 * see `lib/mfgInstalls.ts`.
 */
export default function StreamlinePcMaxPage() {
  const { t } = useTranslation();
  const access = useFeatureAccess('multi_frame_generation');
  const hardware = useHardware((s) => s.profile);
  const ensureHardware = useHardware((s) => s.ensure);

  const [status, setStatus] = useState<MfgToolStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [step, setStep] = useState<string | null>(null);
  const [progress, setProgress] = useState<FetchProgress | null>(null);

  const [streamline, setStreamline] = useState<string | null>(null);

  const [exePath, setExePath] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanReport | null>(null);
  const [existing, setExisting] = useState<MfgInstall | null>(null);
  const [result, setResult] = useState<InstallReport | null>(null);
  const [removed, setRemoved] = useState<UninstallReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    void ensureHardware();
  }, [ensureHardware]);

  useEffect(() => {
    let alive = true;
    api
      .mfgToolStatus('streamline')
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
  const streamlines = status?.streamlines ?? [];
  // null = undetected; only a definite false means this card cannot run it.
  const gpuOk = supportsStreamlinePcMax(hardware);

  /** The Streamline filenames the chosen package would replace. */
  const wantedComponents = useMemo(
    () =>
      (status?.manifest ?? [])
        .filter((f) => f.component === 'streamline' && f.variant === streamline)
        .map((f) => f.destination),
    [status, streamline],
  );

  const missing = useMemo(() => {
    const m: string[] = [];
    if (streamlines.length > 0 && !streamline) m.push(t('aof.streamline'));
    if (!exePath) m.push(t('optiscaler.game'));
    else if (!scan) m.push(t('optiscaler.validGamePath'));
    return m;
  }, [streamlines.length, streamline, exePath, scan, t]);

  const canInstall = Boolean(status?.available) && missing.length === 0 && isTauriShell() && !busy;

  // Re-scan when the Streamline choice changes: which of the game's files would
  // be replaced depends on which package was picked.
  const rescan = useCallback(
    async (path: string) => {
      const report = await scanGame(path, wantedComponents);
      setScan(report);
      setExisting(getInstall('streamline', report.gameDir));
      return report;
    },
    [wantedComponents],
  );

  const chooseGame = useCallback(async () => {
    setError(null);
    setResult(null);
    setRemoved(null);
    try {
      const picked = await pickGameExecutable();
      if (!picked) return;
      setExePath(picked);
      setStage('scanning');
      setStep(t('aof.stepFinding'));
      await rescan(picked);
    } catch (err) {
      setScan(null);
      setExisting(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStage('idle');
      setStep(null);
    }
  }, [rescan, t]);

  useEffect(() => {
    if (!exePath || !streamline) return;
    void rescan(exePath).catch(() => {
      /* the picker already reported any failure */
    });
  }, [streamline, exePath, rescan]);

  const runInstall = useCallback(async () => {
    if (!exePath || !scan) return;
    setError(null);
    setRemoved(null);
    setStage('installing');
    try {
      setStep(t('aof.stepValidating'));
      const report = await installTool({
        tool: 'streamline',
        exePath,
        variant: { streamline },
        onProgress: (p) => {
          setStep(t('aof.stepInstalling'));
          setProgress(p);
        },
      });
      setStep(t('optiscaler.stepVerifying'));

      const entry: MfgInstall = {
        tool: 'streamline',
        gameDir: report.gameDir,
        launcherDir: report.launcherDir,
        exePath,
        version: status?.package?.version ?? '—',
        selection: { streamline },
        installedAt: new Date().toISOString(),
        backupDir: report.backupDir,
        files: report.written.map((w) => ({ path: w.path, replaced: w.replaced })),
      };
      // Record before reporting success: without it Remove cannot identify
      // these files and would have nothing safe to act on.
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
  }, [exePath, scan, streamline, status, t]);

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
      // handle on the files still there.
      if (report.failed.length === 0) {
        clearInstall('streamline', existing.gameDir);
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
      <div className="tool-accent-blue space-y-6">
        <BackLink />
        <SubscriptionGate access={access} title={t('mfg.lockedTitle')} description={t('mfg.lockedHint')} />
      </div>
    );
  }

  return (
    <div className="tool-accent-blue space-y-6">
      <BackLink />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('mfg.streamline.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('streamline.subtitle')}</p>
      </header>

      {/* The hardware floor is stated unconditionally, before any detection —
          the user asked for it to be visible at the top regardless. */}
      <Notice tone="info" icon={Cpu}>{t('streamline.requires4050')}</Notice>

      {!isTauriShell() && <Notice tone="warn" icon={AlertTriangle}>{t('mfg.desktopOnly')}</Notice>}
      {statusError && <Notice tone="warn" icon={AlertTriangle}>{statusError}</Notice>}
      {status && !status.available && <Notice tone="warn" icon={AlertTriangle}>{t('streamline.notPublished')}</Notice>}
      {gpuOk === false && (
        <Notice tone="warn" icon={AlertTriangle}>
          {t('streamline.unsupportedGpu', { gpu: gpuLabel(hardware ?? {}) ?? '' })}
        </Notice>
      )}
      <p className="text-xs text-muted-foreground">{t('mfg.streamline.gpuSupport')}</p>
      {status?.available && (
        <p className="text-xs text-muted-foreground">
          {t('mfg.packageVersion', { name: status.package?.name ?? 'Streamline PC Max', version: status.package?.version ?? '—' })}
        </p>
      )}

      {/* 1 — Streamline version */}
      <ChoiceGrid
        label={t('aof.streamline')}
        hint={t('streamline.pickHint')}
        choices={streamlines}
        value={streamline}
        onChange={setStreamline}
        disabled={busy}
        expected={EXPECTED_STREAMLINES}
        emptyMessage={t('streamline.pickEmpty')}
      />

      {/* 2 — Game */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('optiscaler.game')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('streamline.gameHint')}</p>
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
          <>
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

            {streamline && (
              <div className="mt-4 space-y-2">
                {scan.found.length > 0 ? (
                  <>
                    <p className="text-sm font-medium text-foreground">
                      {t('mfg.willReplace', { count: scan.found.reduce((n, c) => n + c.locations.length, 0) })}
                    </p>
                    <ul className="space-y-1">
                      {scan.found.map((c) => (
                        <li key={c.filename} className="text-xs text-muted-foreground">
                          <span className="font-mono text-foreground">{c.filename}</span>
                          {c.locations.map((l) => (
                            <span key={l} className="ms-2 font-mono opacity-70">
                              {l}
                            </span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <Notice tone="warn" icon={AlertTriangle}>{t('streamline.noComponents')}</Notice>
                )}
                {scan.missing.length > 0 && (
                  <>
                    <p className="text-sm font-medium text-foreground">{t('mfg.willSkip')}</p>
                    <p className="text-xs text-muted-foreground">{t('mfg.willSkipHint')}</p>
                    <p className="font-mono text-xs text-muted-foreground">{scan.missing.join(', ')}</p>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {existing && (
          <div className="mt-4">
            <Notice tone="ok" icon={PackageCheck}>
              {t('streamline.alreadyInstalled', {
                version: existing.version,
                when: new Date(existing.installedAt).toLocaleString(),
              })}
              <span className="mt-1 block font-mono text-xs opacity-80" dir="ltr">
                {Object.values(existing.selection).filter(Boolean).join(' · ') || '—'}
              </span>
            </Notice>
          </div>
        )}
      </section>

      {/* 3 — Install */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('streamline.install')}</h2>
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
          {existing ? t('optiscaler.reinstall') : t('streamline.install')}
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
          {result.skipped.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground">{t('mfg.skipped')}</p>
              <ul className="mt-1 space-y-1">
                {result.skipped.map((s) => (
                  <li key={s.filename} className="text-xs text-muted-foreground">
                    <span className="font-mono">{s.filename}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="break-all text-xs text-muted-foreground">
            {t('mfg.backupAt')} <span className="font-mono">{result.backupDir}</span>
          </p>
        </section>
      )}

      {/* 4 — Remove */}
      {existing && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t('streamline.remove')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('streamline.removeHint')}</p>

          {!confirmRemove ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 aria-hidden className="size-4" />
              {t('streamline.remove')}
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <Notice tone="warn" icon={AlertTriangle}>{t('streamline.confirmRemove', { count: existing.files.length })}</Notice>
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
