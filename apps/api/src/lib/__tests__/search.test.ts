import { describe, expect, it } from 'vitest';
import { sanitizeSearchTerm } from '../search';

describe('sanitizeSearchTerm', () => {
  it('escapes ILIKE wildcards so they match themselves', () => {
    // Unescaped, `%` and `_` matched every row in the catalogue, so searching
    // for either returned all 313 games instead of the ones containing it.
    expect(sanitizeSearchTerm('%')).toBe('\\%');
    expect(sanitizeSearchTerm('_')).toBe('\\_');
    expect(sanitizeSearchTerm('50%_off')).toBe('50\\%\\_off');
  });

  it('escapes the backslash before the metacharacters it introduces', () => {
    // Escaping in the other order would turn `\` into `\\\\` and break the pattern.
    expect(sanitizeSearchTerm('a\\b')).toBe('a\\\\b');
    expect(sanitizeSearchTerm('\\%')).toBe('\\\\\\%');
  });

  it('strips control characters that Postgres text cannot hold', () => {
    // A NUL byte made the driver throw mid-query: a 500 for a malformed search.
    expect(sanitizeSearchTerm('a\u0000b')).toBe('ab');
    expect(sanitizeSearchTerm('a\u001fb\u007f')).toBe('ab');
  });

  it('returns undefined when nothing searchable survives', () => {
    // The caller skips the search clause entirely rather than filtering on ''.
    expect(sanitizeSearchTerm('\u0000')).toBeUndefined();
    expect(sanitizeSearchTerm('   ')).toBeUndefined();
    expect(sanitizeSearchTerm('')).toBeUndefined();
    expect(sanitizeSearchTerm(undefined)).toBeUndefined();
    expect(sanitizeSearchTerm(null)).toBeUndefined();
  });

  it('leaves ordinary terms alone', () => {
    expect(sanitizeSearchTerm('sekiro')).toBe('sekiro');
    expect(sanitizeSearchTerm('  Elden Ring  ')).toBe('Elden Ring');
  });
});
