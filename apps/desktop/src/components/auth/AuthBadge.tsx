import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The circular icon badge at the top of an auth card.
 *
 * Two concentric rings: an outer halo that fades a soft gradient into the page,
 * and an inner disc on the card surface holding the icon. The halo is drawn with
 * a pseudo-element gradient at low opacity so it reads as light falling on the
 * card rather than as a second border — a flat ring at this size looks like a
 * placeholder.
 *
 * Both rings use theme tokens, so the badge follows light/dark and any scoped
 * accent without knowing which is active.
 */
export function AuthBadge({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative flex size-[68px] shrink-0 items-center justify-center rounded-full md:size-24',
        'before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b',
        'before:from-foreground/20 before:to-transparent before:opacity-40',
        className,
      )}
    >
      <span className="relative z-10 flex size-12 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-inset ring-border md:size-16">
        <Icon className="size-6 text-muted-foreground md:size-7" strokeWidth={1.75} />
      </span>
    </div>
  );
}
