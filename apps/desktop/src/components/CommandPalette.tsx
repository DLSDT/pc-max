import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  CornerDownLeft,
  Gamepad2,
  Heart,
  Home,
  LayoutGrid,
  Layers,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Wrench,
} from 'lucide-react';
import { cache } from '@/lib/cache';
import { moveCursor, searchCommands, type CommandItem } from '@/lib/commandSearch';
import { cn } from '@/lib/utils';

/**
 * Ctrl+K.
 *
 * The catalogue is three hundred games behind a sidebar and a search box that
 * navigates to a results page. Getting to one took a click, a page, a scan and
 * another click. This is the same journey in four keystrokes, and it is the
 * thing people who use an app daily reach for first.
 *
 * Pages are listed with no query at all, so it doubles as "what is in this
 * app" for someone who has not learned the sidebar yet.
 */

const PAGES: { to: string; i18nKey: string; icon: typeof Home }[] = [
  { to: '/', i18nKey: 'sidebar.dashboard', icon: Home },
  { to: '/multi-frame-generation', i18nKey: 'sidebar.multiFrameGeneration', icon: Layers },
  { to: '/optimized-setting', i18nKey: 'sidebar.optimizedSetting', icon: SlidersHorizontal },
  { to: '/windows-optimizer', i18nKey: 'sidebar.windowsOptimizer', icon: Wrench },
  { to: '/games', i18nKey: 'sidebar.games', icon: LayoutGrid },
  { to: '/categories', i18nKey: 'sidebar.categories', icon: Tags },
  { to: '/favorites', i18nKey: 'sidebar.favorites', icon: Heart },
  { to: '/recently-viewed', i18nKey: 'sidebar.recentlyViewed', icon: Clock },
  { to: '/recommended', i18nKey: 'sidebar.recommended', icon: Sparkles },
  { to: '/settings', i18nKey: 'sidebar.settings', icon: Settings },
];

export default function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The catalogue is read when the palette opens, not on every keystroke:
  // `cache.getGames()` is stable between mutations, but re-reading it inside
  // the filter would tie this to the cache's identity guarantees for no gain.
  const items = useMemo<CommandItem[]>(() => {
    if (!open) return [];
    const pages: CommandItem[] = PAGES.map((p) => ({
      id: `page:${p.to}`,
      label: t(p.i18nKey),
      to: p.to,
      kind: 'page',
    }));
    const games: CommandItem[] = cache.getGames().map((g) => ({
      id: `game:${g.id}`,
      label: g.name,
      hint: g.tagline ?? undefined,
      to: `/games/${g.slug}`,
      kind: 'game',
      keywords: g.slug,
    }));
    return [...pages, ...games];
  }, [open, t]);

  const results = useMemo(() => searchCommands(items, query), [items, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setCursor(0);
  }, []);

  const run = useCallback(
    (item: CommandItem | undefined) => {
      if (!item) return;
      close();
      navigate(item.to);
    },
    [close, navigate],
  );

  // Ctrl+K from anywhere. Registered on the window rather than a container so
  // it works with focus in a text field, which is where focus usually is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // A query that shortens the list must not leave the cursor past the end.
  useEffect(() => {
    setCursor((c) => (c >= results.length ? 0 : c));
  }, [results.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, results.length]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => moveCursor(c, 1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => moveCursor(c, -1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[cursor]);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={close}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        onKeyDown={onKeyDown}
        className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lift"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.placeholder')}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t('palette.empty')}</p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.id}
                type="button"
                data-active={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(item)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors',
                  i === cursor ? 'bg-accent text-accent-foreground' : 'text-foreground',
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary [&_svg]:size-3.5">
                  {item.kind === 'game' ? <Gamepad2 aria-hidden /> : <IconFor to={item.to} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  {item.hint && <span className="block truncate text-xs text-muted-foreground">{item.hint}</span>}
                </span>
                {i === cursor && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>{t('palette.hintKeys')}</span>
          <span>{t('palette.count', { count: results.length })}</span>
        </div>
      </div>
    </div>
  );
}

/** The sidebar's icon for a page, so the palette and the sidebar agree. */
function IconFor({ to }: { to: string }) {
  const Icon = PAGES.find((p) => p.to === to)?.icon ?? Home;
  return <Icon aria-hidden />;
}
