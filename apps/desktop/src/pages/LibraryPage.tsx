import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudOff, FolderOpen, FolderPlus, Loader2, Radar, ScanSearch, WifiOff } from 'lucide-react';
import { useGames } from '@/hooks/useLibrary';
import { useLibrary } from '@/store/library';
import { ApiError } from '@/lib/api';
import { detectGamesOnDisk, applyDetection, type KnownExecutable } from '@/lib/detect';
import { extractGameIcon, selectGameExecutable, splitPath } from '@/lib/gameExe';
import { isTauriShell } from '@/lib/optimizer';
import GameLibraryCard from '@/components/GameLibraryCard';
import { Button, Input } from '@/components/ui';
import { Section } from '@/components/Section';

export default function LibraryPage() {
  const { t } = useTranslation();
  const games = useLibrary((s) => s.games);
  const addManual = useLibrary((s) => s.addManual);
  const updateSlug = useLibrary((s) => s.updateSlug);
  const catalog = useGames();

  const [path, setPath] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [associating, setAssociating] = useState<string | null>(null);
  const [associateSlug, setAssociateSlug] = useState('');

  const catalogBySlug = new Map((catalog.data?.data ?? []).map((g) => [g.slug, g]));

  const entries = Object.values(games).sort((a, b) => a.name.localeCompare(b.name));

  async function handleDetect() {
    setDetecting(true);
    setDetectNote(null);
    try {
      const known: KnownExecutable[] = (catalog.data?.data ?? [])
        .filter((g) => g.executables.length > 0)
        .map((g) => ({ slug: g.slug, name: g.name, executables: g.executables }));
      const result = await detectGamesOnDisk(known);
      applyDetection(result);
      if (!result.realFs) {
        setDetectNote(t('library.detectionDesktopOnly'));
      } else {
        setDetectNote(t('library.detectionFound', { count: result.found.length }));
      }
    } finally {
      setDetecting(false);
    }
  }

  function handleAdd() {
    const trimmed = path.trim();
    if (!trimmed) return;
    addManual({
      slug: '',
      name: trimmed.split(/[\\/]/).filter(Boolean).pop() ?? trimmed,
      path: trimmed,
      unknown: true,
    });
    setPath('');
  }

  /** Native "select a game's .exe" flow — matches it against the catalog by
   * executable name and extracts its real embedded icon, per spec. */
  async function handleBrowse() {
    setBrowsing(true);
    try {
      const exePath = await selectGameExecutable();
      if (!exePath) return;
      const { dir, file } = splitPath(exePath);
      const iconDataUrl = (await extractGameIcon(exePath)) ?? undefined;
      const matched = (catalog.data?.data ?? []).find((g) =>
        g.executables.some((exe) => exe.toLowerCase() === file.toLowerCase()),
      );
      addManual({
        slug: matched?.slug ?? '',
        name: matched?.name ?? file.replace(/\.exe$/i, ''),
        path: dir,
        executable: file,
        unknown: !matched,
        iconDataUrl,
      });
    } finally {
      setBrowsing(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('library.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('library.subtitle')}</p>
      </header>

      {/* Catalog load failure — detection/association need the live catalog. */}
      {catalog.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          {catalog.error instanceof ApiError && typeof navigator !== 'undefined' && navigator.onLine === false ? (
            <WifiOff aria-hidden className="size-4 shrink-0 text-amber-600" />
          ) : (
            <CloudOff aria-hidden className="size-4 shrink-0 text-amber-600" />
          )}
          <span className="min-w-0 flex-1">
            {catalog.error instanceof ApiError && catalog.error.kind !== 'http'
              ? catalog.error.message
              : t('common.serviceUnavailable')}
          </span>
          <Button size="sm" variant="outline" onClick={() => void catalog.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleDetect} disabled={detecting} className="gap-2">
            {detecting ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Radar aria-hidden className="size-4" />}
            {detecting ? t('library.detecting') : t('library.detect')}
          </Button>
          <span className="text-xs text-muted-foreground">
            {isTauriShell() ? t('library.detectionDesktopOnly') : t('library.notRealFs')}
          </span>
        </div>
        {detectNote && <p className="text-xs font-medium text-primary">{detectNote}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void handleBrowse()}
            disabled={browsing || !isTauriShell()}
            title={!isTauriShell() ? t('library.detectionDesktopOnly') : undefined}
            className="gap-2"
          >
            {browsing ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FolderOpen aria-hidden className="size-4" />}
            {t('library.browseExe')}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="lib-path" className="text-xs font-semibold text-foreground">
            {t('library.addManualPath')}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="lib-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={t('library.pathPlaceholder')}
              dir="ltr"
              className="min-w-64 flex-1"
            />
            <Button variant="outline" onClick={handleAdd} className="gap-2">
              <FolderPlus aria-hidden className="size-4" />
              {t('library.add')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('library.pathHint')}</p>
        </div>
      </div>

      {/* Library */}
      <Section title={t('library.title')}>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-6">
              <ScanSearch aria-hidden />
            </div>
            <p className="max-w-md text-sm text-muted-foreground">{t('library.noGames')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.path}>
                <GameLibraryCard entry={entry} catalog={catalogBySlug.get(entry.slug)} />
                {entry.unknown && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{t('library.associateWith')}:</span>
                    {associating === entry.path ? (
                      <>
                        <select
                          value={associateSlug}
                          onChange={(e) => setAssociateSlug(e.target.value)}
                          className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                        >
                          <option value="">—</option>
                          {[...catalogBySlug.values()].map((g) => (
                            <option key={g.slug} value={g.slug}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const g = catalogBySlug.get(associateSlug);
                            if (g) updateSlug(entry.path, g.slug, g.name);
                            setAssociating(null);
                            setAssociateSlug('');
                          }}
                          className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssociating(null)}
                          className="rounded-md border border-border px-2.5 py-1 text-muted-foreground"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAssociating(entry.path)}
                        className="rounded-md border border-border bg-card px-2.5 py-1 font-medium text-foreground hover:bg-secondary"
                      >
                        {t('library.associate')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
