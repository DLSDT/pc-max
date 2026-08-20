import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Heart, Sparkles } from 'lucide-react';
import type { GameSummary } from '@goh/types';
import { cache } from '@/lib/cache';
import { useIsFavorite } from '@/hooks/useFavorites';
import { CARD_TECHS, TECH_LABELS } from '@/lib/labels';
import { gameIconUrl } from '@/lib/gameIcons';
import { toggleFavorite } from '@/lib/favorites';
import { cn } from '@/lib/utils';
import { Badge } from './ui';

function Cover({ game }: { game: GameSummary }) {
  const icon = gameIconUrl(game.slug);
  // Games auto-created from Optimized Setting imports have no curated genres
  // and a placeholder performanceRating (50) — hide that fabricated number
  // rather than presenting it as a real rating.
  const hasCuratedMeta = game.genres.length > 0;
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden bg-secondary">
      {icon ? (
        // Real bundled artwork — shown over the gradient tile.
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-secondary via-card to-primary/20 p-6">
          <img
            src={icon}
            alt={`${game.name} icon`}
            loading="lazy"
            className="max-h-full w-auto object-contain transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : game.coverUrl ? (
        <img
          src={game.coverUrl}
          alt={`${game.name} cover`}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-secondary via-card to-primary/20">
          <span className="text-5xl font-bold text-foreground/15">{game.name.charAt(0)}</span>
          <Gamepad2 aria-hidden className="absolute size-10 text-foreground/10" />
        </div>
      )}

      {hasCuratedMeta && (
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-background/80 px-1.5 py-0.5 backdrop-blur">
          <span className="h-1 w-8 overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${game.performanceRating}%` }}
            />
          </span>
          <span className="text-[10px] font-bold tabular-nums text-foreground">{game.performanceRating}</span>
        </div>
      )}
    </div>
  );
}

export default function GameCard({ game }: { game: GameSummary }) {
  const { t } = useTranslation();
  const isFavorite = useIsFavorite(game.id);
  const profile = game.defaultProfile;
  const cachedVersions = cache.getProfileVersions(game.slug);
  const newVersion = profile ? cachedVersions[profile.slug] : undefined;
  const hasNewOptimization = Boolean(profile && newVersion && newVersion !== profile.version);

  const techs = CARD_TECHS.filter((flag) => game.technologies[flag]);

  function onToggleFavorite(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void toggleFavorite(game).catch(() => {
      /* optimistic update rolled back inside toggleFavorite */
    });
  }

  return (
    <Link
      to={`/games/${game.slug}`}
      className="group relative block overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {hasNewOptimization && (
        <Badge variant="warning" className="absolute right-2 top-10 z-10 shadow-lg">
          <Sparkles aria-hidden className="size-3" />
          {t('card.newOptimization', { version: profile?.version })}
        </Badge>
      )}

      <Cover game={game} />

      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={isFavorite ? t('card.unfavorite') : t('card.favorite')}
        aria-pressed={isFavorite}
        className={cn(
          'absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full backdrop-blur transition-all',
          isFavorite ? 'bg-destructive/90 text-destructive-foreground' : 'bg-background/70 text-muted-foreground hover:text-destructive',
        )}
      >
        <Heart aria-hidden className={cn('size-4', isFavorite && 'fill-current')} />
      </button>

      <div className="space-y-2 p-3.5">
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
          {game.name}
        </h3>
        <p className="line-clamp-1 text-xs text-muted-foreground">
          {game.genres.map((g) => g.name).join(' · ') || '—'}
          {game.releaseYear ? ` · ${game.releaseYear}` : ''}
        </p>

        {techs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {techs.map((flag) => (
              <Badge key={flag} variant="secondary" className="px-1.5 py-0 text-[9px]">
                {TECH_LABELS[flag]}
              </Badge>
            ))}
          </div>
        )}

        {profile && (
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-xs font-medium text-primary">{profile.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('games.fps', { fps: profile.targetFps ?? '—' })}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
