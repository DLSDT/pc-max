import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { genreDescription, genreName } from '@/i18n';
import { ChevronRight, LayoutGrid } from 'lucide-react';
import { useHome } from '@/hooks/useLibrary';
import { EmptyState, Skeleton } from '@/components/ui';

export default function CategoriesPage() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useHome();
  const categories = data?.categories ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('sidebar.categories')}</h1>

      {isLoading && !categories.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <EmptyState icon={<LayoutGrid aria-hidden />} title={t('categories.empty')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/games?genre=${encodeURIComponent(c.slug)}`}
              className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow-sm"
            >
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold transition-colors group-hover:text-primary">
                  {genreName(c.slug, c.name, i18n.language)}
                </h2>
                {genreDescription(c.slug, c.description, i18n.language) && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {genreDescription(c.slug, c.description, i18n.language)}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">{t('categories.games', { count: c.gameCount })}</p>
              </div>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
