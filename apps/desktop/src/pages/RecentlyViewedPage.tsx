import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRecent } from '@/hooks/useFavorites';
import { EmptyState } from '@/components/ui';
import GameCard from '@/components/GameCard';
import { GameGrid } from '@/components/Section';

export default function RecentlyViewedPage() {
  const { t } = useTranslation();
  const recent = useRecent();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('recently.title')}</h1>
      {recent.length === 0 ? (
        <EmptyState
          icon={<Clock aria-hidden />}
          title={t('recently.empty')}
          action={
            <Link
              to="/games"
              className="inline-flex h-8 items-center rounded-md border border-border bg-secondary px-3 text-xs font-medium transition-colors hover:bg-secondary/80"
            >
              {t('games.title')}
            </Link>
          }
        />
      ) : (
        <GameGrid>
          {recent.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </GameGrid>
      )}
    </div>
  );
}
