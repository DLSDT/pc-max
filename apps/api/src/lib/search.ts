/**
 * Normalize a user-supplied search term before it becomes an ILIKE pattern.
 *
 * Two things went wrong with the raw value:
 *
 *  - `%` and `_` are ILIKE wildcards, so searching for either matched every
 *    row instead of the literal character.
 *  - Postgres text cannot contain a NUL byte. One in the query string made the
 *    driver throw mid-request, turning a malformed search into a 500 with a
 *    stack trace in the logs instead of an empty result.
 *
 * Returns undefined when nothing searchable is left, so the caller skips the
 * search clause entirely rather than filtering on an empty pattern.
 */
export function sanitizeSearchTerm(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  // NUL and the other C0 control characters are never meaningful in a search
  // box, and NUL specifically is not representable in a Postgres text value.
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned) return undefined;
  // Escape the LIKE metacharacters so they match themselves. The backslash
  // goes first, or it would double-escape the ones added after it.
  return cleaned.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => `\\${c}`);
}
