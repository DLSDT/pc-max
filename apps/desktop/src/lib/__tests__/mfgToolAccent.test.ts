/**
 * Each Multi-Frame Generation tool must carry its own accent colour.
 *
 * This exists because the accent regressed silently: `MfgToolPage` took an
 * `accent` prop, three pages passed three different values, and the component
 * rendered a hardcoded `tool-accent-green` in both of its return branches. Every
 * test still passed and all three tools looked green. The bug is invisible to a
 * render test that only checks text, so this asserts the wiring directly on the
 * source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../../');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const PAGES = [
  { file: 'pages/OptiScalerPage.tsx', tool: 'optiscaler', accent: 'tool-accent-red' },
  { file: 'pages/AiOpticalFlowPage.tsx', tool: 'optiflow', accent: 'tool-accent-green' },
  { file: 'pages/StreamlinePcMaxPage.tsx', tool: 'streamline', accent: 'tool-accent-blue' },
];

describe('MFG tool accents', () => {
  it('gives each tool a distinct accent', () => {
    const accents = PAGES.map((p) => p.accent);
    expect(new Set(accents).size, 'two tools share an accent').toBe(PAGES.length);
  });

  it('each page declares its own tool and accent', () => {
    for (const p of PAGES) {
      const src = read(p.file);
      expect(src, `${p.file} tool`).toContain(`tool="${p.tool}"`);
      expect(src, `${p.file} accent`).toContain(`accent="${p.accent}"`);
    }
  });

  it('MfgToolPage applies the prop and hardcodes no accent of its own', () => {
    const src = read('components/MfgToolPage.tsx');
    // Every return branch must use the prop — the gate branch was the one that
    // silently kept green.
    const hardcoded = src.match(/className=("|')tool-accent-[a-z]+/g) ?? [];
    expect(hardcoded, 'MfgToolPage hardcodes an accent class').toEqual([]);
    expect(src).toContain('cn(accent,');
    // Both branches (subscription gate + main) must be scoped.
    expect((src.match(/cn\(accent,/g) ?? []).length, 'a return branch is missing the accent').toBeGreaterThanOrEqual(2);
  });

  it('every accent the pages use is defined for light and dark', () => {
    const css = read('index.css');
    for (const p of PAGES) {
      expect(css, `${p.accent} light`).toContain(`.${p.accent} {`);
      expect(css, `${p.accent} dark`).toContain(`:root.dark .${p.accent} {`);
    }
  });
});
