import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, CheckCircle2, FolderOpen, Loader2, PackageCheck, ShieldCheck, Trash2 } from 'lucide-react';
import type { HardwareProfileInput, MfgTool, MfgToolStatusResponse, PackageComponent } from '@goh/types';
import ChoiceGrid from '@/components/ChoiceGrid';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { api } from '@/lib/api';
import { isTauriShell } from '@/lib/optimizer';
import { gpuLabel } from '@/lib/hardware';

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
import { clearInstall, getInstall, listInstalls, recordInstall, type MfgInstall } from '@/lib/mfgInstalls';
import { installErrorMessage } from '@/lib/installErrors';
import { cn } from '@/lib/utils';

type Stage = 'idle' | 'scanning' | 'installing' | 'removing';

/** One selectable group on a tool's page — OptiScaler has three, Streamline
 *  PC Max has one. */
export interface ToolAxis {
  component: PackageComponent;
  labelKey: string;
  hintKey: string;
  emptyKey: string;
  /** How many the product ships, for the "1 of 4 published" line. */
  expected?: number;
  /** When set, this axis decides which of the game's files get replaced, so
   *  changing it re-scans the install. */
  drivesScan?: boolean;
}

export interface MfgToolPageProps {
  tool: MfgTool;
  /** Scoped accent class — the three tools are told apart by colour. */
  accent: string;
  axes: ToolAxis[];
  titleKey: string;
  subtitleKey: string;
  notPublishedKey: string;
  noComponentsKey: string;
  gameHintKey: string;
  installKey: string;
  removeKey: string;
  removeHintKey: string;
  confirmRemoveKey: string;
  alreadyInstalledKey: string;
  /** Always-visible hardware requirement, shown before any detection runs. */
  requirementKey?: string;
  /** Definite false = this card cannot run the tool. null = unknown. */
  gpuCheck?: (hw: HardwareProfileInput | null) => boolean | null;
  unsupportedGpuKey?: string;
}

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

/** Bytes as whole megabytes — the unit a 250 MB download is read in. */
function formatMb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1);
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
export default function MfgToolPage({
  tool,
  accent,
  axes,
  titleKey,
  subtitleKey,
  notPublishedKey,
  noComponentsKey,
  gameHintKey,
  installKey,
  removeKey,
  removeHintKey,
  confirmRemoveKey,
  alreadyInstalledKey,
  requirementKey,
  gpuCheck,
  unsupportedGpuKey,
}: MfgToolPageProps) {
  const { t } = useTranslation();
  const access = useFeatureAccess('multi_frame_generation');
  const hardware = useHardware((s) => s.profile);
  const ensureHardware = useHardware((s) => s.ensure);

  const [status, setStatus] = useState<MfgToolStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [step, setStep] = useState<string | null>(null);
  const [progress, setProgress] = useState<FetchProgress | null>(null);

  /** Chosen variant per axis. One map rather than a useState per axis, so a
   *  tool with three groups and one with a single group share this code. */
  const [selection, setSelection] = useState<Partial<Record<PackageComponent, string | null>>>({});
  const choose = useCallback((component: PackageComponent, name: string) => {
    setSelection((prev) => ({ ...prev, [component]: name }));
  }, []);

  const [exePath, setExePath] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanReport | null>(null);
  const [existing, setExisting] = useState<MfgInstall | null>(null);
  const [result, setResult] = useState<InstallReport | null>(null);
  const [removed, setRemoved] = useState<UninstallReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Every install of this tool on this machine, not just the one belonging to
   * the executable currently picked.
   *
   * Removal is driven by the record written at install time — it never guesses
   * by filename — so a record the user cannot reach is an install they cannot
   * undo. Gating the remove button on a fresh scan meant exactly that: after
   * installing into three games, each one could only be reverted by coming
   * back and re-selecting that game's .exe, and if the scan failed for any
   * reason the files stayed with no way back.
   */
  const [installs, setInstalls] = useState<MfgInstall[]>([]);
  const refreshInstalls = useCallback(() => setInstalls(listInstalls(tool)), [tool]);
  useEffect(() => { refreshInstalls(); }, [refreshInstalls]);

  /** Which record the confirm prompt is for — null when nothing is pending. */
  const [pendingRemoval, setPendingRemoval] = useState<MfgInstall | null>(null);

  useEffect(() => {
    void ensureHardware();
  }, [ensureHardware]);

  useEffect(() => {
    let alive = true;
    api
      .mfgToolStatus(tool)
      .then((res) => alive && setStatus(res))
      .catch((err) => {
        if (!alive) return;
        const e = statusErrorFor(err);
        setStatusError('key' in e ? t(e.key) : e.message);
      });
    return () => {
      alive = false;
    };
  }, [t, tool]);

  const busy = stage !== 'idle';
  // null = undetected; only a definite false means this card cannot run it.
  const gpuOk = gpuCheck ? gpuCheck(hardware) : null;

  /** Published choices per axis, from the status payload's per-component lists. */
  const choicesFor = useCallback(
    (c: PackageComponent) => {
      const s = status as unknown as Record<string, { name: string; fileCount: number; totalBytes: number }[]> | null;
      return s?.[`${c}s`] ?? [];
    },
    [status],
  );

  /** Filenames the chosen package would replace in place — only files whose
   *  role is `streamline` are found-and-replaced; everything else has a fixed
   *  destination and needs no search. */
  const scanAxis = axes.find((a) => a.drivesScan);
  const scanChoice = scanAxis ? (selection[scanAxis.component] ?? null) : null;
  const wantedComponents = useMemo(
    () =>
      !scanAxis
        ? []
        : (status?.manifest ?? [])
            .filter((f) => f.role === 'streamline' && f.component === scanAxis.component && f.variant === scanChoice)
            .map((f) => f.destination),
    [status, scanAxis, scanChoice],
  );

  const missing = useMemo(() => {
    const m: string[] = [];
    // An axis with nothing published is not something the user can satisfy, so
    // it is not listed as missing — the "not published" notice covers that.
    for (const a of axes) {
      if (choicesFor(a.component).length > 0 && !selection[a.component]) m.push(t(a.labelKey));
    }
    if (!exePath) m.push(t('optiscaler.game'));
    else if (!scan) m.push(t('optiscaler.validGamePath'));
    return m;
  }, [axes, choicesFor, selection, exePath, scan, t]);

  const canInstall = Boolean(status?.available) && missing.length === 0 && isTauriShell() && !busy;

  // Re-scan when the scan-driving choice changes: which of the game's files
  // would be replaced depends on which package was picked.
  // Switching version twice in a row starts two directory walks. Without a
  // guard the slower one lands last and the "what will change" list describes a
  // package the user is no longer choosing. Only the newest request may write.
  const scanSeq = useRef(0);
  const rescan = useCallback(
    async (path: string) => {
      const seq = ++scanSeq.current;
      const report = await scanGame(path, wantedComponents);
      if (seq !== scanSeq.current) return report;
      setScan(report);
      setExisting(getInstall(tool, report.gameDir));
      return report;
    },
    [wantedComponents, tool],
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
      setStep(t('optiscaler.stepLocating'));
      await rescan(picked);
    } catch (err) {
      setScan(null);
      setExisting(null);
      setError(installErrorMessage(err, t));
    } finally {
      setStage('idle');
      setStep(null);
    }
  }, [rescan, t]);

  useEffect(() => {
    if (!exePath || !scanChoice) return;
    void rescan(exePath).catch(() => {
      /* the picker already reported any failure */
    });
  }, [scanChoice, exePath, rescan]);

  const runInstall = useCallback(async () => {
    if (!exePath || !scan) return;
    setError(null);
    setRemoved(null);
    setStage('installing');
    try {
      setStep(t('optiscaler.stepPreparing'));
      const report = await installTool({
        tool,
        exePath,
        variant: selection,
        onProgress: (p) => {
          setStep(t('optiscaler.stepDownloading'));
          setProgress(p);
        },
      });
      setStep(t('optiscaler.stepVerifying'));

      const entry: MfgInstall = {
        tool,
        gameDir: report.gameDir,
        launcherDir: report.launcherDir,
        exePath,
        version: status?.package?.version ?? '—',
        selection: selection as Record<string, string | null>,
        installedAt: new Date().toISOString(),
        backupDir: report.backupDir,
        files: report.written.map((w) => ({ path: w.path, replaced: w.replaced })),
      };
      // Record before reporting success: without it Remove cannot identify
      // these files and would have nothing safe to act on.
      try {
        recordInstall(entry);
        refreshInstalls();
      } catch {
        setError(t('optiscaler.recordFailed'));
      }
      setExisting(entry);
      setResult(report);
    } catch (err) {
      setError(installErrorMessage(err, t));
    } finally {
      setStage('idle');
      setStep(null);
      setProgress(null);
    }
  }, [exePath, scan, selection, status, t, tool, titleKey]);

  const runRemove = useCallback(async (entry: MfgInstall) => {
    setError(null);
    setResult(null);
    setStage('removing');
    try {
      setStep(t('optiscaler.stepRemoving'));
      const report = await uninstallTool({
        exePath: entry.exePath,
        backupDir: entry.backupDir,
        files: entry.files,
      });
      setRemoved(report);
      // Keep the record when something could not be undone — it is the only
      // handle on the files still there.
      if (report.failed.length === 0) {
        clearInstall(tool, entry.gameDir);
        if (existing?.gameDir === entry.gameDir) setExisting(null);
      }
      refreshInstalls();
    } catch (err) {
      setError(installErrorMessage(err, t));
    } finally {
      setStage('idle');
      setStep(null);
      setPendingRemoval(null);
    }
  }, [existing, refreshInstalls, t, tool]);

  if (!access.allowed) {
    return (
      <div className={cn(accent, 'space-y-6')}>
        <BackLink />
        <SubscriptionGate access={access} title={t('mfg.lockedTitle')} description={t('mfg.lockedHint')} />
      </div>
    );
  }

  return (
    // Scope the page to its tool accent: every primary-coloured control below
    // follows it, so the three tools are told apart by colour before a word is read.
    <div className={cn(accent, 'space-y-6')}>
      <BackLink />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t(titleKey)}</h1>
        <p className="text-sm text-muted-foreground">{t(subtitleKey)}</p>
      </header>

      {!isTauriShell() && <Notice tone="warn" icon={AlertTriangle}>{t('mfg.desktopOnly')}</Notice>}
      {statusError && <Notice tone="warn" icon={AlertTriangle}>{statusError}</Notice>}
      {status && !status.available && <Notice tone="warn" icon={AlertTriangle}>{t(notPublishedKey)}</Notice>}
      {gpuOk === false && unsupportedGpuKey && (
        <Notice tone="warn" icon={AlertTriangle}>
          {t('mfg.optiflow.unsupportedGpu', { gpu: gpuLabel(hardware ?? {}) ?? '' })}
        </Notice>
      )}
      <p className="text-xs text-muted-foreground">{t('mfg.optiflow.gpuSupport')}</p>
      {status?.available && (
        <p className="text-xs text-muted-foreground">
          {t('mfg.packageVersion', { name: status.package?.name ?? t(titleKey), version: status.package?.version ?? '—' })}
        </p>
      )}

      {/* 1..N — one picker per axis, in the order the tool declares them */}
      {axes.map((a) => (
        <ChoiceGrid
          key={a.component}
          label={t(a.labelKey)}
          hint={t(a.hintKey)}
          choices={choicesFor(a.component)}
          value={selection[a.component] ?? null}
          onChange={(name) => choose(a.component, name)}
          disabled={busy}
          expected={a.expected}
          emptyMessage={t(a.emptyKey)}
        />
      ))}

      {/* Game */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('optiscaler.game')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(gameHintKey)}</p>
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

            {scanChoice && (
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
                  <Notice tone="warn" icon={AlertTriangle}>{t(noComponentsKey)}</Notice>
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
              {t(alreadyInstalledKey, {
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

      {/* Install */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t(installKey)}</h2>
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
          {existing ? t('optiscaler.reinstall') : t(installKey)}
        </button>

        {step && (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {step}
              {progress && ` — ${progress.filename}`}
            </p>
            {progress && progress.bytesTotal > 0 && (
              <>
                {/* A quarter of a gigabyte over an Iranian connection is minutes,
                    not seconds. A file counter alone leaves the user unable to
                    tell a slow download from a stuck one. */}
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={Math.round((progress.bytesDone / progress.bytesTotal) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.min(100, (progress.bytesDone / progress.bytesTotal) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground" dir="ltr">
                  {formatMb(progress.bytesDone)} / {formatMb(progress.bytesTotal)} MB
                  {' · '}
                  {progress.index}/{progress.total}
                </p>
              </>
            )}
          </div>
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

      {/* Remove — every recorded install of this tool, not just the picked one */}
      {installs.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t(removeKey)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(removeHintKey)}</p>

          <ul className="mt-4 space-y-3">
            {installs.map((entry) => {
              const pending = pendingRemoval?.gameDir === entry.gameDir;
              return (
                <li key={entry.gameDir} className="rounded-lg border border-border/70 p-3">
                  <p className="truncate text-sm font-medium text-foreground" title={entry.gameDir}>
                    {entry.gameDir}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('optiscaler.installedSummary', {
                      version: entry.version,
                      when: new Date(entry.installedAt).toLocaleString(),
                    })}
                    {' · '}
                    {Object.values(entry.selection).filter(Boolean).join(' · ') || '—'}
                  </p>

                  {!pending ? (
                    <button
                      type="button"
                      onClick={() => setPendingRemoval(entry)}
                      disabled={busy}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 aria-hidden className="size-4" />
                      {t(removeKey)}
                    </button>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <Notice tone="warn" icon={AlertTriangle}>
                        {t(confirmRemoveKey, { count: entry.files.length })}
                      </Notice>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void runRemove(entry)}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {stage === 'removing' && <Loader2 aria-hidden className="size-4 animate-spin" />}
                          {t('optiscaler.confirmRemoveYes')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingRemoval(null)}
                          disabled={busy}
                          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
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
