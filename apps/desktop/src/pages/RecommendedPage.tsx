import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useFeatured } from '@/hooks/useLibrary';
import { EmptyState } from '@/components/ui';
import { CardSkeleton } from '@/components/CardSkeleton';
import GameCard from '@/components/GameCard';
import { GameGrid } from '@/components/Section';

/**
 * Admin-curated picks — backed by the real `featured` flag on games (set from
 * the admin Games tab), not a placeholder. Same source the Dashboard's
 * "Popular Games" featured row uses.
 */
/** A full grid of picks, not the dashboard's single 6-wide row. */
const RECOMMENDED_LIMIT = 24;

export default function RecommendedPage() {
  const { t } = useTranslation();
  const { data: games, isLoading } = useFeatured(RECOMMENDED_LIMIT);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('recommended.title')}</h1>

      {isLoading && !games ? (
        <GameGrid>
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </GameGrid>
      ) : !games || games.length === 0 ? (
        <EmptyState icon={<Sparkles aria-hidden />} title={t('recommended.placeholder')} />
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
