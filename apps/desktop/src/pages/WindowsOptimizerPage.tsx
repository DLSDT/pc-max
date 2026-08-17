import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Cpu,
  FileClock,
  Gauge,
  Laptop,
  Loader2,
  Monitor,
  Radar,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useWinOpt, computeScore, recommend, type Recommendation } from '@/store/winopt';
import { PROFILES, type Category, type Risk } from '@/lib/winopt';
import { Button, Badge, Spinner } from '@/components/ui';
import { Section } from '@/components/Section';
import { cn } from '@/lib/utils';

const CATEGORY_KEYS: { key: Category; labelKey: string; icon: typeof Cpu }[] = [
  { key: 'startup', labelKey: 'winopt.catStartup', icon: Rocket },
  { key: 'processes', labelKey: 'winopt.catProcesses', icon: Activity },
  { key: 'services', labelKey: 'winopt.catServices', icon: Server },
  { key: 'gaming', labelKey: 'winopt.catGaming', icon: Gamepad },
  { key: 'power', labelKey: 'winopt.catPower', icon: Zap },
  { key: 'visual_effects', labelKey: 'winopt.catVisual', icon: Palette },
  { key: 'network', labelKey: 'winopt.catNetwork', icon: Network },
  { key: 'privacy', labelKey: 'winopt.catPrivacy', icon: ShieldCheck },
  { key: 'cleanup', labelKey: 'winopt.catCleanup', icon: Trash2 },
];

import { Activity, Gamepad, Network, Palette, Rocket, Server, Trash2, Zap } from 'lucide-react';

const RISK_STYLE: Record<Risk, string> = {
  low: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  high: 'border-red-500/40 bg-red-500/10 text-red-600',
  experimental: 'border-purple-500/30 bg-purple-500/10 text-purple-600',
};

const IMPACT_STYLE: Record<Recommendation['impact'], string> = {
  high: 'text-red-600',
  medium: 'text-amber-600',
  low: 'text-emerald-600',
};

export default function WindowsOptimizerPage() {
  const { t } = useTranslation();
  const { status, scan, snapshots, lastApply, recovery, error, scanSystem, apply, restore, recover } = useWinOpt();

  const [profile, setProfile] = useState<string>('gaming');
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState<string | null>(null); // step label while applying

  useEffect(() => {
    void scanSystem();
    void recover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const score = useMemo(() => computeScore(scan), [scan]);
  const recommendations = useMemo(() => recommend(scan), [scan]);
  const supported = scan?.supported === true;

  const recommendedIds = recommendations.map((r) => r.tweak.id);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function runOptimize() {
    const ids = selected.length ? selected : recommendedIds;
    if (!ids.length) return;
    const steps = ['winopt.stepScan', 'winopt.stepAnalyze', 'winopt.stepBackup', 'winopt.stepApply', 'winopt.stepVerify'];
    setSelected(ids);
    for (const s of steps) {
      setRunning(s);
      await new Promise((r) => setTimeout(r, 500));
    }
    await apply(profile, ids);
    setRunning(null);
  }

  const riskCounts = recommendations.reduce(
    (acc, r) => {
      acc[r.tweak.risk] = (acc[r.tweak.risk] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('winopt.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('winopt.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {scan?.supported && (scan.laptop ? <Badge variant="outline"><Laptop aria-hidden className="size-3" /> {t('winopt.laptop')}</Badge> : <Badge variant="outline"><Monitor aria-hidden className="size-3" /> {t('winopt.desktop')}</Badge>)}
          {scan?.windowsVersion && (
            <Badge variant="outline">Windows {scan.windowsVersion[0]} · build {scan.windowsVersion[1]}</Badge>
          )}
        </div>
      </header>

      {recovery?.interrupted && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <RotateCcw aria-hidden className="size-4 text-amber-600" />
          <span className="flex-1 font-medium">
            {t('winopt.recoveryDetected')} — {recovery.message}
          </span>
          <Button size="sm" variant="outline" onClick={() => void recover()}>
            {t('winopt.recoverNow')}
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          <XCircle aria-hidden className="size-4" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {!supported ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground [&_svg]:size-7">
            <Wrench aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t('winopt.unsupportedTitle')}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('winopt.unsupportedBody')}</p>
          </div>
          {status === 'scanning' && <Spinner />}
        </div>
      ) : (
        <>
          {/* Score + primary CTA */}
          <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
            <div className="absolute inset-0 bg-crimson-hero" />
            <div className="relative flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
              <div className="flex items-center gap-5">
                <div className="flex size-24 flex-col items-center justify-center rounded-2xl border border-primary/20 bg-white shadow-sm">
                  <span className="text-3xl font-bold text-primary">{score?.score ?? '—'}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t('winopt.score')}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold">{t(`winopt.scoreLabel.${score?.label ?? 'fair'}`)}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {recommendations.length === 0
                      ? t('winopt.allOptimized')
                      : t('winopt.recommendationCount', { count: recommendations.length })}
                  </p>
                </div>
              </div>
              <Button size="lg" onClick={() => void runOptimize()} disabled={running !== null || !recommendedIds.length} className="gap-2 shadow-glow-sm">
                {running ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
                {running ? t(running) : t('winopt.smartOptimize')}
              </Button>
            </div>
          </section>

          {/* Profiles */}
          <Section title={t('winopt.profiles')}>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(PROFILES).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setProfile(key)}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-all',
                    profile === key ? 'border-primary/50 bg-accent shadow-sm' : 'border-border bg-card hover:border-primary/30',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{t(`winopt.profile.${key}`)}</span>
                    {profile === key && <CheckCircle2 aria-hidden className="size-4 text-primary" />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t(`winopt.profileHint.${key}`)}</p>
                </button>
              ))}
            </div>
          </Section>

          {/* Recommendations */}
          <Section
            title={t('winopt.recommendations')}
            action={
              recommendations.length
                ? {
                    label: selected.length === recommendations.length ? t('winopt.clearSelection') : t('winopt.selectAll'),
                    onClick: () => setSelected(selected.length === recommendations.length ? [] : recommendedIds),
                  }
                : undefined
            }
          >
            {recommendations.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                <CheckCircle2 aria-hidden className="size-5 text-emerald-600" />
                {t('winopt.allOptimized')}
              </div>
            ) : (
              <div className="space-y-2.5">
                {recommendations.map((r) => {
                  const checked = selected.includes(r.tweak.id);
                  return (
                    <label
                      key={r.tweak.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
                        checked ? 'border-primary/40 bg-accent/60' : 'border-border bg-card hover:border-primary/25',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(r.tweak.id)}
                        className="mt-0.5 size-4 accent-[hsl(355_83%_41%)]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{r.tweak.name}</span>
                          <Badge variant="outline" className={RISK_STYLE[r.tweak.risk]}>
                            {t(`winopt.risk.${r.tweak.risk}`)}
                          </Badge>
                          <span className={cn('text-xs font-medium', IMPACT_STYLE[r.impact])}>
                            {t(`winopt.impact.${r.impact}`)}
                          </span>
                          {r.tweak.requiresRestart && <Badge variant="outline">{t('winopt.restartNeeded')}</Badge>}
                          {r.tweak.requiresAdmin && <Badge variant="outline">{t('winopt.adminNeeded')}</Badge>}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.tweak.description}</p>
                      </div>
                      {checked && <CheckCircle2 aria-hidden className="size-4 shrink-0 text-primary" />}
                    </label>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Categories */}
          <Section title={t('winopt.categories')}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORY_KEYS.map(({ key, labelKey, icon: Icon }) => {
                const count = recommendations.filter((r) => r.tweak.category === key).length;
                return (
                  <div key={key} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-5">
                      <Icon aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t(labelKey)}</p>
                      <p className="text-xs text-muted-foreground">
                        {count === 0 ? t('winopt.noRecommendations') : t('winopt.categoryCount', { count })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Snapshots / history */}
          <Section title={t('winopt.snapshots')}>
            {snapshots.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
                <FileClock aria-hidden className="size-5" />
                {t('winopt.noSnapshots')}
              </div>
            ) : (
              <div className="space-y-2.5">
                {snapshots.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t(`winopt.profile.${s.profile}`)} · {t('winopt.changes', { count: s.changeCount })}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {new Date(Number(s.createdAt)).toLocaleString()} — {s.tweaks.join(', ')}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void restore(s.id)} className="gap-1.5">
                      <RotateCcw aria-hidden className="size-3.5" />
                      {t('winopt.restore')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Last result */}
          {lastApply && (
            <Section title={t('winopt.lastResult')}>
              <div className="rounded-xl border border-border bg-card p-5">
                {lastApply.status === 'committed' ? (
                  <div className="flex items-start gap-3">
                    <CheckCircle2 aria-hidden className="size-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold">{t('winopt.applyDone', { count: lastApply.changeCount })}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t('winopt.applyDoneHint')}</p>
                      {lastApply.requiresRestart && <p className="mt-1 text-xs font-medium text-amber-600">{t('winopt.restartHint')}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <XCircle aria-hidden className="size-5 shrink-0 text-red-600" />
                    <div>
                      <p className="text-sm font-semibold">{t('winopt.applyFailed')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{lastApply.error ?? t('winopt.rolledBack')}</p>
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
