import { Boxes, Building2, CalendarDays, Cpu } from 'lucide-react';
import type { GameDetail, GameSummary } from '@goh/types';
import { cn } from '@/lib/utils';

type AnyGame = GameSummary | (GameSummary & Partial<GameDetail>);

// The card grid goes as dense as ~110px per card at its widest breakpoint, so
// this picks its two facts by how well they survive that width: a year is 4
// characters and a studio name is usually short, while an API string like
// "DirectX 11 / DirectX 12" truncates to a handful of characters and stops
// being useful. `developer`/`publisher` only exist on GameDetail — on the grid
// card (GameSummary) they are simply absent and the row is skipped.
function specRows(game: AnyGame) {
  const g = game as GameSummary & Partial<GameDetail>;
  const all = [
    { key: 'developer', icon: Building2, value: g.developer ?? null },
    {
      key: 'year',
      icon: CalendarDays,
      value: game.releaseYear != null ? String(game.releaseYear) : null,
    },
    { key: 'engine', icon: Boxes, value: game.engine ?? null },
    { key: 'api', icon: Cpu, value: game.api ?? null },
  ];
  return all.filter((r): r is typeof r & { value: string } => Boolean(r.value));
}

/**
 * Compact spec strip for a game card: the two facts most likely to fit and be
 * readable at grid width, one per line rather than wrapped inline (a card can
 * be as narrow as ~110px, and three facts sharing one row there truncated to
 * a handful of characters each). Renders nothing when the catalogue has no
 * curated data for this game — a row of "—" placeholders would read as a
 * loading failure, not as "not entered yet".
 */
export function GameSpecsInline({ game, className }: { game: AnyGame; className?: string }) {
  const rows = specRows(game).slice(0, 2);
  if (rows.length === 0) return null;
  return (
    <ul className={cn('flex flex-col gap-0.5', className)}>
      {rows.map(({ key, icon: Icon, value }) => (
        <li key={key} title={value} className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Icon aria-hidden className="size-3 shrink-0 opacity-70" />
          <span className="truncate">{value}</span>
        </li>
      ))}
    </ul>
  );
}
