import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
import { useLibrary } from '@/store/library';
import { useGames } from '@/hooks/useLibrary';
import GameLibraryCard from '@/components/GameLibraryCard';

/**
 * Shared "pick one of your games" list — used by pages whose real content
 * lives on the game's own detail page (Optimized Setting's Yellow/Green
 * profiles, Multi-Frame Generation's package install), so both just need to
 * get the user to a game. Renders the same rows as the Games library page.
 */
export default function MyGamesPicker() {
  const { t } = useTranslation();
  const games = useLibrary((s) => s.games);
  const catalog = useGames();

  const catalogBySlug = new Map((catalog.data?.data ?? []).map((g) => [g.slug, g]));
  const entries = Object.values(games).sort((a, b) => a.name.localeCompare(b.name));

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-6">
          <Gamepad2 aria-hidden />
        </div>
        <p className="max-w-md text-sm text-muted-foreground">{t('picker.noGames')}</p>
        <Link
          to="/library"
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('picker.goToGames')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <GameLibraryCard key={entry.path} entry={entry} catalog={catalogBySlug.get(entry.slug)} />
      ))}
    </div>
  );
}
