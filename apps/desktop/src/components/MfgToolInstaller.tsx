import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSearch, FolderOpen, Loader2, ShieldCheck } from 'lucide-react';
import type { MfgTool, MfgToolStatusResponse } from '@goh/validation';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useHardware } from '@/store/hardware';
import { gpuLabel } from '@/lib/hardware';
import { isVendorMismatch, normalizeVendor, recommendProfile, supportsOpticalFlow } from '@/lib/gpuProfile';
import { api, ApiError } from '@/lib/api';
import { isTauriShell } from '@/lib/optimizer';
import {
  componentNames,
  installTool,
  pickGameExecutable,
  scanGame,
  type FetchProgress,
  type InstallReport,
  type ScanReport,
} from '@/lib/optiflow';

type Stage = 'idle' | 'scanning' | 'ready' | 'installing' | 'done';

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * The shared install flow for both Multi-Frame Generation tools: select the
 * game's executable, see exactly what would change, then install.
 *
 * OptiFlow and OptiScaler differ in what their manifests contain, not in how
 * a file reaches the disk — so they share this one pipeline rather than each
 * growing a parallel copy of the path handling. OptiFlow's manifest is mostly
 * `streamline` entries (replace what the game ships); OptiScaler's is mostly
 * `launcher` entries (drop beside the executable). Both resolve through the
 * same bounds-checked Rust installer.
 *
 * The scan step is not decoration. This writes into a game the user paid for,
 * so before anything is downloaded the page shows the resolved install folder,
 * the launcher folder, which components will be replaced and which parts of
 * the package do not apply. An install that surprises the user is a bug even
 * when every byte lands correctly.
 */
export default function MfgToolInstaller({ tool }: { tool: MfgTool }) {
  const { t } = useTranslation();
  const k = (suffix: string) => `mfg.${tool}.${suffix}`;
  const access = useFeatureAccess('multi_frame_generation');
  const [status, setStatus] = useState<MfgToolStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [exePath, setExePath] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanReport | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  /** True once the user has picked a profile themselves — after that, a later
   *  detection must not silently move their choice. */
  const [variantTouched, setVariantTouched] = useState(false);
  const hardware = useHardware((s) => s.profile);
  const ensureHardware = useHardware((s) => s.ensure);
  const gpuVendor = normalizeVendor(hardware);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [result, setResult] = useState<InstallReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Detection is cached and only re-runs when stale, so calling it on mount is
  // cheap. Without it a user who never opened the dashboard has no GPU on
  // record and would get no recommendation at all.
  useEffect(() => {
    void ensureHardware();
  }, [ensureHardware]);

  // Availability is a public check on purpose: an admin who has not uploaded
  // the package yet should read "not published", not "buy a subscription".
  useEffect(() => {
    let alive = true;
    api
      .mfgToolStatus(tool)
      .then((res) => {
        if (!alive) return;
        setStatus(res);
        // Preselect rather than leaving it blank: the server refuses a download
        // with no profile chosen, and an empty select would read as "optional".
        // Prefer the profile built for this machine's GPU; fall back to the
        // first only when detection found nothing to match.
        setVariant(recommendProfile(res.variants, gpuVendor) ?? res.variants[0] ?? null);
      })
      .catch((err) => alive && setStatusError(err instanceof ApiError ? err.message : 'Could not reach the server.'));
    return () => {
      alive = false;
    };
    // gpuVendor is deliberately not a dependency: re-running this on a late
    // detection would refetch the package. The effect below moves the
    // selection instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Detection often lands after the package does. Move the preselection once,
  // and never over a choice the user has already made.
  useEffect(() => {
    if (variantTouched || !status || status.variants.length === 0) return;
    const better = recommendProfile(status.variants, gpuVendor);
    if (better && better !== variant) setVariant(better);
  }, [gpuVendor, status, variant, variantTouched]);

  const choose = useCallback(async () => {
    setError(null);
    setResult(null);
    try {
      const picked = await pickGameExecutable();
      if (!picked) return;
      setExePath(picked);
      setStage('scanning');
      const wanted = componentNames(status?.manifest ?? []);
      const report = await scanGame(picked, wanted);
      setScan(report);
      setStage('ready');
    } catch (err) {
      setScan(null);
      setStage('idle');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [status]);

  const install = useCallback(async () => {
    if (!exePath) return;
    setError(null);
    setStage('installing');
    try {
      const report = await installTool({ tool, exePath, variant, onProgress: setProgress });
      setResult(report);
      setStage('done');
    } catch (err) {
      setStage('ready');
      setError(err instanceof ApiError || err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  }, [exePath, tool, variant]);

  if (!access.allowed) {
    return (
      <div className="space-y-6">
        <BackLink />
        <SubscriptionGate access={access} title={t('mfg.lockedTitle')} description={t('mfg.lockedHint')} />
      </div>
    );
  }

  const replaceCount = scan?.found.reduce((n, c) => n + c.locations.length, 0) ?? 0;
  const busy = stage === 'scanning' || stage === 'installing';

  // A manifest of only `launcher`/`relative` files (OptiScaler's shape) finds
  // nothing to replace and still installs perfectly well — gating the button on
  // `found.length` would leave that tool permanently disabled.
  // Only the files this install would actually write: the base plus the one
  // selected profile. Counting the whole manifest would promise the user six
  // OptiScaler.ini files when they are getting one.
  const manifest = (status?.manifest ?? []).filter((f) => f.variant === null || f.variant === variant);
  const wantsComponents = manifest.some((f) => f.role === 'streamline');
  const unconditionalFiles = manifest.filter((f) => f.role !== 'streamline').length;
  const canInstall = replaceCount > 0 || unconditionalFiles > 0;
  const recommended = recommendProfile(status?.variants ?? [], gpuVendor);
  const mismatch = isVendorMismatch(variant, gpuVendor);
  // null = unknown; only `false` is a positive "this card cannot run it".
  const opticalFlowOk = tool === 'optiflow' ? supportsOpticalFlow(hardware) : null;

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t(k('title'))}</h1>
        <p className="text-sm text-muted-foreground">{t(k('subtitle'))}</p>
      </header>

      {!isTauriShell() && <Notice tone="warn" icon={AlertTriangle}>{t('mfg.desktopOnly')}</Notice>}
      {statusError && <Notice tone="warn" icon={AlertTriangle}>{statusError}</Notice>}
      {status && !status.available && <Notice tone="warn" icon={AlertTriangle}>{t(k('notPublished'))}</Notice>}
      {/* Only shown on a definite "no" — an undetected GPU must not be told
          its card is unsupported. */}
      {opticalFlowOk === false && (
        <Notice tone="warn" icon={AlertTriangle}>
          {t('mfg.optiflow.unsupportedGpu', { gpu: gpuLabel(hardware ?? {}) ?? '' })}
        </Notice>
      )}
      <p className="text-xs text-muted-foreground">{t(k('gpuSupport'))}</p>

      {status?.available && (
        <p className="text-xs text-muted-foreground">
          {t('mfg.packageVersion', { name: status.package?.name ?? 'OptiFlow', version: status.package?.version ?? '—' })}
        </p>
      )}

      {/* Step 1 — pick the executable */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t(k('step1'))}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(k('step1Hint'))}</p>
        <button
          type="button"
          onClick={choose}
          disabled={busy || !isTauriShell() || !status?.available}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stage === 'scanning' ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FolderOpen aria-hidden className="size-4" />}
          {exePath ? t('mfg.chooseAnother') : t('mfg.chooseExe')}
        </button>
        {exePath && <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{exePath}</p>}
      </section>

      {/* Profile selection — only for a package that offers profiles */}
      {(status?.variants.length ?? 0) > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t('mfg.profileTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('mfg.profileHint')}</p>
          {gpuVendor ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('mfg.gpuDetected', { gpu: gpuLabel(hardware ?? {}) ?? gpuVendor })}
            </p>
          ) : (
            // Never silently pick a vendor: say detection did not resolve and
            // leave the choice with the user.
            <p className="mt-2 text-xs text-muted-foreground">{t('mfg.gpuUnknown')}</p>
          )}
          <div role="radiogroup" aria-label={t('mfg.profileTitle')} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {status!.variants.map((name) => {
              const selected = variant === name;
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => {
                    setVariant(name);
                    setVariantTouched(true);
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-start text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-accent/40'
                  }`}
                >
                  <span className="block font-mono" dir="ltr">
                    {name}
                  </span>
                  {recommended === name && (
                    <span className="mt-1 block text-[11px] font-normal text-primary">{t('mfg.recommendedForYourGpu')}</span>
                  )}
                </button>
              );
            })}
          </div>
          {mismatch && (
            // A warning, not a block: detection can be wrong on laptops with
            // switchable graphics, and the user may know better than we do.
            <div className="mt-3">
              <Notice tone="warn" icon={AlertTriangle}>
                {t('mfg.profileMismatch', { gpu: gpuLabel(hardware ?? {}) ?? gpuVendor ?? '' })}
              </Notice>
            </div>
          )}
        </section>
      )}

      {/* Step 2 — what would change */}
      {scan && (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <FileSearch aria-hidden className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">{t('mfg.step2')}</h2>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Field label={t('mfg.gameFolder')} value={scan.gameDir} />
            <Field label={t('mfg.launcherFolder')} value={scan.launcherDir} />
          </dl>

          {scan.truncated && <Notice tone="warn" icon={AlertTriangle}>{t('mfg.truncated')}</Notice>}

          {scan.found.length > 0 ? (
            <div>
              <p className="text-sm font-medium text-foreground">{t('mfg.willReplace', { count: replaceCount })}</p>
              <ul className="mt-2 space-y-1">
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
            </div>
          ) : wantsComponents ? (
            <Notice tone="warn" icon={AlertTriangle}>{t(k('noComponents'))}</Notice>
          ) : null}

          {variant && (
            <p className="text-sm text-foreground">
              {t('mfg.profileSelected')} <span className="font-mono" dir="ltr">{variant}</span>
            </p>
          )}

          {unconditionalFiles > 0 && (
            <p className="text-sm text-foreground">
              {t('mfg.willAdd', { count: unconditionalFiles, dir: scan.launcherDir })}
            </p>
          )}

          {scan.missing.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground">{t('mfg.willSkip')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('mfg.willSkipHint')}</p>
              <p className="mt-2 font-mono text-xs text-muted-foreground">{scan.missing.join(', ')}</p>
            </div>
          )}

          <Notice tone="info" icon={ShieldCheck}>{t('mfg.backupNote')}</Notice>

          <button
            type="button"
            onClick={install}
            disabled={busy || !canInstall}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stage === 'installing' && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t('mfg.install')}
          </button>
          {progress && (
            <p className="text-xs text-muted-foreground">
              {t('mfg.downloading', { file: progress.filename, index: progress.index + 1, total: progress.total })}
            </p>
          )}
        </section>
      )}

      {error && <Notice tone="error" icon={AlertTriangle}>{error}</Notice>}

      {/* Step 3 — result */}
      {result && stage === 'done' && (
        <section className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 aria-hidden className="size-5 text-emerald-500" />
            <h2 className="text-sm font-semibold text-foreground">
              {t('mfg.installed', { count: result.written.length })}
            </h2>
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
                    <span className="font-mono">{fileName(s.filename)}</span> — {s.reason}
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'warn' | 'error';
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  const styles = {
    info: 'border-border bg-muted/40 text-muted-foreground',
    warn: 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400',
    error: 'border-destructive/30 bg-destructive/5 text-destructive',
  }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${styles}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
