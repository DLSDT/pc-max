import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, FolderOpen, MonitorCog, Package, Trash2, XCircle } from 'lucide-react';
import type { GameSummary } from '@goh/types';
import { useLibrary, type LibraryGame } from '@/store/library';
import { getApplied } from '@/lib/backup';
import { api } from '@/lib/api';
import { gameIconUrl } from '@/lib/gameIcons';
import { Badge } from '@/components/ui';

interface Props {
  entry: LibraryGame;
  catalog?: GameSummary;
}

/**
 * One row of the user's game library. Shows how the game was found (detected /
 * manual), whether it is a supported catalog game, and — for supported games —
 * the live optimization-package status (available version / installed version /
 * none). Package data is fetched per game and cached by react-query.
 */
export default function GameLibraryCard({ entry, catalog }: Props) {
  const { t } = useTranslation();
  const remove = useLibrary((s) => s.remove);
  const applied = getApplied().find((a) => a.gameSlug === entry.slug);

  const packages = useQuery({
    queryKey: ['game-packages', entry.slug],
    queryFn: () => api.gamePackages(entry.slug).then((r) => r.data),
    enabled: Boolean(catalog),
    staleTime: 60_000,
  });

  const icon = catalog ? (gameIconUrl(catalog.slug) ?? catalog.coverUrl) : null;
  const latest = packages.data?.[0];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Icon */}
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
        {icon ? (
          <img src={icon} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <FolderOpen aria-hidden className="size-6 text-muted-foreground" />
        )}
      </div>

      {/* Identity + status */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {catalog?.name ?? entry.name}
          </p>
          {catalog ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 aria-hidden className="size-3" />
              {t('library.supported')}
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <XCircle aria-hidden className="size-3" />
              {t('library.unknown')}
            </Badge>
          )}
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            {entry.source === 'detected' ? <MonitorCog aria-hidden className="size-3" /> : <FolderOpen aria-hidden className="size-3" />}
            {entry.source === 'detected' ? t('library.detected') : t('library.manual')}
          </Badge>
        </div>

        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground" dir="ltr">
          <FolderOpen aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{entry.path}</span>
          {entry.executable ? <span className="shrink-0">· {entry.executable}</span> : null}
        </p>

        {/* Optimization state */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {!catalog ? (
            <span className="text-muted-foreground">{t('library.unknownHint')}</span>
          ) : packages.isLoading ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Package aria-hidden className="size-3.5" />
              {t('library.optChecking')}
            </span>
          ) : latest ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-primary">
              <Package aria-hidden className="size-3.5" />
              {applied
                ? `${t('library.optInstalled')} · ${t('library.optVersion', { version: applied.version })}`
                : `${t('library.optAvailable')} · ${t('library.optVersion', { version: latest.version })}`}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('library.optNone')}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {catalog && (
          <Link
            to={`/games/${catalog.slug}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            {t('library.openGame')}
            <ExternalLink aria-hidden className="size-3.5" />
          </Link>
        )}
        <button
          type="button"
          onClick={() => remove(entry.path)}
          aria-label={t('library.remove')}
          title={t('library.remove')}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          <Trash2 aria-hidden className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
