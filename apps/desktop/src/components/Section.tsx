import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  /** Link action, or a button action when `onClick` is provided. */
  action?: { to: string; label: string } | { onClick: () => void; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {action &&
          ('to' in action ? (
            <Link
              to={action.to}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {action.label}
              <ChevronRight aria-hidden className="size-3.5 rtl:rotate-180" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {action.label}
              <ChevronRight aria-hidden className="size-3.5 rtl:rotate-180" />
            </button>
          ))}
      </div>
      {children}
    </section>
  );
}

/** Responsive game-card grid used by every library section. */
export function GameGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
