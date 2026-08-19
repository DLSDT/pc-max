import { useTranslation } from 'react-i18next';
import { CloudOff, SlidersHorizontal, WifiOff } from 'lucide-react';
import { useOptimizedSettingGames } from '@/hooks/useLibrary';
import { ApiError } from '@/lib/api';
import { Button, EmptyState } from '@/components/ui';
import { CardSkeleton } from '@/components/CardSkeleton';
import GameCard from '@/components/GameCard';
import { GameGrid } from '@/components/Section';

/**
 * Optimized Setting — every game with a published Yellow/Green profile,
 * server-driven and shown unconditionally: a game stays listed here even if
 * it isn't in the user's own library or installed on this machine. Clicking
 * a card opens the game's real detail page, where the Yellow/Green settings
 * (GameDetailPage's ColorProfilesSection) are rendered from real data.
 */
export default function OptimizedSettingPage() {
  const { t } = useTranslation();
  const { data: games, isLoading, isError, error, refetch } = useOptimizedSettingGames();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('optimizedSetting.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('optimizedSetting.subtitle')}</p>
      </header>

      {isError && !games ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          {error instanceof ApiError && typeof navigator !== 'undefined' && navigator.onLine === false ? (
            <WifiOff aria-hidden className="size-4 shrink-0 text-amber-600" />
          ) : (
            <CloudOff aria-hidden className="size-4 shrink-0 text-amber-600" />
          )}
          <span className="min-w-0 flex-1">
            {error instanceof ApiError && error.kind !== 'http' ? error.message : t('common.serviceUnavailable')}
          </span>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : isLoading ? (
        <GameGrid>
          {Array.from({ length: 10 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </GameGrid>
      ) : !games || games.length === 0 ? (
        <EmptyState title={t('optimizedSetting.empty')} icon={<SlidersHorizontal aria-hidden />} />
      ) : (
        <GameGrid>
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </GameGrid>
      )}
    </div>
  );
}
