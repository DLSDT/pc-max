import { cn } from '@/lib/utils';

/**
 * A hairline rule.
 *
 * Deliberately not `@radix-ui/react-separator`: this app has no Radix packages
 * at all, and a decorative 1px line does not justify becoming the first. A
 * non-decorative separator gets `role="separator"` so assistive tech still
 * announces the division.
 */
export function Separator({
  orientation = 'horizontal',
  decorative = true,
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  /** False when the rule carries meaning (e.g. it separates two distinct groups). */
  decorative?: boolean;
  className?: string;
}) {
  return (
    <div
      {...(decorative ? { 'aria-hidden': true } : { role: 'separator', 'aria-orientation': orientation })}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    />
  );
}
