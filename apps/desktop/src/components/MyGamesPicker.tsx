import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderPlus, Gamepad2 } from 'lucide-react';
import { useLibrary } from '@/store/library';
import { useCatalog } from '@/hooks/useFavorites';
import GameLibraryCard from '@/components/GameLibraryCard';

/**
 * Shared "pick one of your games" list — used by pages whose real content
 * lives on the game's own detail page (Optimized Setting's Yellow/Green
 * profiles, Multi-Frame Generation's package install), so both just need to
 * get the user to a game. Renders the same rows as the Games library page.
 *
 * `/library` (detect/browse-for-.exe) isn't its own sidebar entry — this is
 * the entry point back to it, always visible, not just on the empty state.
 */
export default function MyGamesPicker() {
  const { t } = useTranslation();
  const games = useLibrary((s) => s.games);
  const catalog = useCatalog();

  const catalogBySlug = new Map(catalog.map((g) => [g.slug, g]));
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
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <FolderPlus aria-hidden className="size-4" />
          {t('picker.goToGames')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          to="/library"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <FolderPlus aria-hidden className="size-3.5" />
          {t('picker.manageGames')}
        </Link>
      </div>
      {entries.map((entry) => (
        <GameLibraryCard key={entry.path} entry={entry} catalog={catalogBySlug.get(entry.slug)} />
      ))}
    </div>
  );
}
