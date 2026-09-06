/**
 * No component may name a brand colour directly.
 *
 * The palette is a set of CSS variables so that changing one value re-themes
 * the app. A literal defeats that silently: the Windows Optimizer's checkboxes
 * carried `accent-[hsl(355_83%_41%)]` — the crimson from two palettes ago —
 * and survived the move to burgundy untouched, because nothing failed. Every
 * tick on that page stayed bright red and the only way to notice was to look
 * at it.
 *
 * This reads the source rather than a render, because that is where the
 * mistake lives and a render test would have to know what colour to expect.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../../');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (name.endsWith('.tsx') || (name.endsWith('.ts') && !name.endsWith('.d.ts'))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Colour written into a Tailwind class. `bg-[#fff]`, `text-[hsl(...)]`,
 * `accent-[hsl(...)]` — anything that pins a value the tokens cannot reach.
 *
 * Deliberately narrow: `border-primary/40` and `bg-emerald-500/10` are fine.
 * The first goes through the palette; the second is a status colour that is
 * meant to stay green whatever the brand is.
 */
const ARBITRARY_COLOUR = /\b(?:bg|text|border|accent|fill|stroke|ring|shadow|from|via|to)-\[(?:#|hsl|rgb)[^\]]*\]/g;

describe('the palette is the only place a brand colour is written', () => {
  it('no component pins a colour a token cannot reach', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      // index.css is the palette itself; it is supposed to contain values.
      const src = readFileSync(file, 'utf8');
      for (const hit of src.match(ARBITRARY_COLOUR) ?? []) {
        offenders.push(`${file.slice(SRC.length)} — ${hit}`);
      }
    }
    expect(offenders, 'use a palette token instead').toEqual([]);
  });

  it('the old crimsons are gone from the source entirely', () => {
    // The three values the app shipped before burgundy. Any of them appearing
    // again means a component went around the palette.
    const dead = ['#C1121F', '#8B0000', '#E50914', '355 83% 41%', '355_83%_41%'];
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const value of dead) {
        if (src.includes(value)) offenders.push(`${file.slice(SRC.length)} — ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
