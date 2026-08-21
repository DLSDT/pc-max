import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Regression: docker-compose forwarded ZARINPAL_MERCHANT_ID with an empty
 * default (`${VAR:-}`). The config schema requires a non-empty string, so the
 * API refused to start and production served 502s — a compose-only change that
 * no unit test or typecheck could catch.
 *
 * Any `${VAR:-}` here means "pass an empty string", which is never what a
 * validated env var wants: either give it a real default or omit the line so
 * the schema's own default applies.
 */
const compose = readFileSync(path.resolve(__dirname, '../../../../infrastructure/docker-compose.yml'), 'utf-8');

describe('docker-compose environment', () => {
  it('never blanks out a variable that has a working schema default', () => {
    // `${VAR:-}` passes an EMPTY STRING. Harmless for a var the schema also
    // requires (you get a clear error either way), but for one that HAS a
    // default it silently replaces that default with '' and fails validation
    // at boot — which is exactly how ZARINPAL_MERCHANT_ID took production down.
    const config = readFileSync(path.resolve(__dirname, '../config.ts'), 'utf-8');
    // Read ONLY this variable's own declaration — it ends where the next
    // top-level key begins. Spanning lines would pick up a neighbour's
    // .default() and report a false positive.
    const hasSchemaDefault = (name: string) => {
      const start = config.search(new RegExp(`^\\s{2}${name}:`, 'm'));
      if (start === -1) return false;
      const rest = config.slice(start + name.length + 4);
      const nextKey = rest.search(/^\s{2}[A-Z][A-Z0-9_]*:/m);
      return /\.default\(/.test(nextKey === -1 ? rest : rest.slice(0, nextKey));
    };

    const offenders = compose
      .split('\n')
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /\$\{[A-Z0-9_]+:-\}\s*$/.test(l))
      .map(([n, l]) => [n, l.trim().match(/\$\{([A-Z0-9_]+):-\}/)![1]!] as const)
      .filter(([, name]) => hasSchemaDefault(name))
      .map(([n, name]) => `line ${n}: ${name} has a schema default that '' would override`);

    expect(offenders).toEqual([]);
  });

  it('keeps the mock payment gateway a deliberate choice', () => {
    // If PAYMENT_PROVIDER can be mock, ALLOW_MOCK_PAYMENTS must be passed too —
    // otherwise the production guard refuses to boot and nobody knows why.
    const allowsMock = /PAYMENT_PROVIDER:\s*\$\{PAYMENT_PROVIDER:-mock\}/.test(compose);
    if (allowsMock) {
      expect(compose, 'mock provider needs ALLOW_MOCK_PAYMENTS alongside it').toMatch(/ALLOW_MOCK_PAYMENTS:/);
    }
  });
});
