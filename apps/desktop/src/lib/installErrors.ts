/**
 * Turning an installer failure into a sentence the user can read.
 *
 * The Rust core returns `code|detail`. It used to return an English sentence,
 * which surfaced verbatim in the Persian UI at the one moment the user most
 * needs to understand what happened — "Refusing to write outside the game
 * folder: F:\…" is not a message, it is a stack trace with manners.
 *
 * The code carries the meaning and gets translated; the detail is the part
 * only the machine knows (a path, an OS error) and is passed through as-is,
 * because translating a path helps nobody.
 *
 * Anything that does not look like `code|detail` is shown unchanged. Errors
 * reach here from more than one layer — the API client and the Tauri bridge
 * both throw plain messages — and mangling those would trade one unreadable
 * error for another.
 */
import type { TFunction } from 'i18next';

const CODE = /^[a-z][a-z0-9_]*$/;

/** Rust names errors in snake_case; every key in this app's i18n is camelCase. */
function camel(code: string): string {
  return code.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function installErrorMessage(err: unknown, t: TFunction): string {
  const raw = err instanceof Error ? err.message : String(err);
  const sep = raw.indexOf('|');
  if (sep === -1) return raw;

  const code = raw.slice(0, sep);
  const detail = raw.slice(sep + 1).trim();
  if (!CODE.test(code)) return raw;

  // defaultValue '' rather than the key: an unrecognised code should fall back
  // to something a user could still forward to support, not to "mfg.err.foo".
  const message = t(`mfg.err.${camel(code)}`, { detail, defaultValue: '' });
  if (message) return message;
  return detail ? `${code}: ${detail}` : code;
}
