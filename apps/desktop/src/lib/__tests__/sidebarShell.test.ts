import { describe, expect, it } from 'vitest';
import { sidebarShellClass } from '@/components/layout/Sidebar';

/**
 * The sidebar disappeared entirely on a Persian desktop, and nothing said so:
 * no error, no failed request, no overflow. It rendered, with a transform that
 * put it outside the window — and the button that opens the drawer is hidden at
 * that width, because at that width there is supposed to be a sidebar.
 *
 * The cause was CSS specificity, which no amount of reading the component
 * tells you: `rtl:translate-x-full` compiles to `[dir="rtl"] .rtl\:…`, two
 * selectors, and out-ranks the single-selector `lg:translate-x-0` that was
 * supposed to cancel it. A media query adds nothing to specificity.
 *
 * So the rule these pin is: the transform that parks the sidebar off-canvas
 * may only exist below `lg`. Never unbounded, never relying on being overridden.
 */
describe('the sidebar shell', () => {
  const OFF_CANVAS = /(?:^|\s)(-?translate-x-full)/;

  it('parks itself off-canvas only below the desktop breakpoint', () => {
    const closed = sidebarShellClass({ collapsed: false, navOpen: false });
    expect(closed, 'an unbounded off-canvas transform reaches the desktop too').not.toMatch(OFF_CANVAS);
    expect(closed).toContain('max-lg:-translate-x-full');
    expect(closed).toContain('max-lg:rtl:translate-x-full');
  });

  it('is never parked off-canvas while the drawer is open', () => {
    const open = sidebarShellClass({ collapsed: false, navOpen: true });
    expect(open).not.toMatch(OFF_CANVAS);
    expect(open).not.toContain('max-lg:');
    expect(open).toContain('translate-x-0');
  });

  it('keeps the desktop column visible in both states', () => {
    for (const navOpen of [true, false]) {
      for (const collapsed of [true, false]) {
        const cls = sidebarShellClass({ collapsed, navOpen });
        expect(cls, `navOpen=${navOpen} collapsed=${collapsed}`).toContain('lg:translate-x-0');
        expect(cls).toContain('lg:static');
      }
    }
  });

  it('narrows to the icon rail only on the desktop, where it can be widened again', () => {
    const collapsed = sidebarShellClass({ collapsed: true, navOpen: false });
    expect(collapsed).toContain('lg:w-16');
    // The drawer keeps its own width; the desktop collapse must not shrink it.
    expect(collapsed).toContain('w-72');
  });
});
