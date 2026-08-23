/**
 * The MFG install screens are the first place in this app to use i18next
 * plural keys (`_one` / `_other`). A missing or misnamed plural form does not
 * throw — i18next renders the raw key — so it would ship as literal
 * "mfg.willReplace" on someone's screen. These tests resolve the real bundles
 * through a plain i18next instance (no DOM, no app side effects).
 */
import { describe, expect, it } from 'vitest';
import i18n from 'i18next';
// Imported for its side effect: this is what registers the app's bundles.
import '@/i18n';

async function tFor(lng: 'en' | 'fa') {
  await i18n.changeLanguage(lng);
  return i18n.t.bind(i18n);
}

const bundle = (lng: 'en' | 'fa') => i18n.getResourceBundle(lng, 'translation') as Record<string, unknown>;

describe('MFG plural strings', () => {
  it('renders singular and plural in English', async () => {
    const t = await tFor('en');
    expect(t('mfg.willReplace', { count: 1 })).toBe('1 file will be replaced');
    expect(t('mfg.willReplace', { count: 3 })).toBe('3 files will be replaced');
    expect(t('mfg.installed', { count: 2 })).toBe('Installed — 2 files written');
    expect(t('mfg.willAdd', { count: 4, dir: 'C:/g/bin' })).toBe('4 files will be added to C:/g/bin');
  });

  it('resolves rather than echoing the key in Persian', async () => {
    const t = await tFor('fa');
    for (const key of ['mfg.willReplace', 'mfg.willAdd', 'mfg.installed']) {
      for (const count of [1, 3]) {
        const out = t(key, { count, dir: 'C:/g' });
        expect(out, `${key} count=${count}`).not.toContain(key);
        expect(out.length).toBeGreaterThan(0);
      }
    }
    expect(t('mfg.willReplace', { count: 3 })).toContain('3');
  });

  it('has every OptiScaler key in both languages, and none echo the key name', async () => {
    // The OptiScaler page is the largest string block in the app; a key present
    // in one locale only renders as the raw dotted path on someone's screen.
    const t = await tFor('fa');
    const en = bundle('en').optiscaler as Record<string, string>;
    const fa = bundle('fa').optiscaler as Record<string, string>;
    expect(Object.keys(en).filter((k) => !(k in fa)), 'missing in fa').toEqual([]);
    expect(Object.keys(fa).filter((k) => !(k in en)), 'missing in en').toEqual([]);
    for (const k of Object.keys(en)) {
      const out = t(`optiscaler.${k}`, { count: 2, n: 6, expected: 12, items: 'x', version: '1', when: 'now', restored: 1, removed: 1, failed: 1 });
      expect(out, `optiscaler.${k}`).not.toContain('optiscaler.');
    }
  });

  it('has every MFG key in both languages', async () => {
    const flatten = (obj: unknown, prefix = ''): string[] =>
      typeof obj === 'object' && obj !== null
        ? Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k))
        : [prefix];
    const en = new Set(flatten(bundle('en').mfg, 'mfg'));
    const fa = new Set(flatten(bundle('fa').mfg, 'mfg'));
    expect([...en].filter((k) => !fa.has(k)), 'missing in fa').toEqual([]);
    expect([...fa].filter((k) => !en.has(k)), 'missing in en').toEqual([]);
  });
});
