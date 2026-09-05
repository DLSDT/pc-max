import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFavorites } from '@/hooks/useFavorites';
import { EmptyState } from '@/components/ui';
import GameCard from '@/components/GameCard';
import { GameGrid } from '@/components/Section';

export default function FavoritesPage() {
  const { t } = useTranslation();
  const favorites = useFavorites();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('favorites.title')}</h1>
      {favorites.length === 0 ? (
        <EmptyState
          icon={<Heart aria-hidden />}
          title={t('favorites.empty')}
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
          {favorites.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </GameGrid>
      )}
    </div>
  );
}
