import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression: every read in this app falls back to the local cache — either
 * via placeholderData or a catch inside the queryFn. React Query's DEFAULT
 * networkMode ('online') pauses queries while navigator.onLine is false, so
 * the queryFn never runs and those fallbacks are dead exactly when they are
 * needed. The Optimized Setting page rendered "nothing published yet" offline
 * while the cache held 62 games.
 *
 * Nothing throws when this regresses — the app just looks empty offline — so
 * assert the setting directly.
 */
const main = readFileSync(path.resolve(__dirname, '../../main.tsx'), 'utf-8');
const hooks = readFileSync(path.resolve(__dirname, '../../hooks/useLibrary.ts'), 'utf-8');

describe('offline-first query behaviour', () => {
  it("runs queries even when the browser reports offline", () => {
    expect(main, "QueryClient must set networkMode: 'always'").toMatch(/networkMode:\s*'always'/);
  });

  it('keeps a cache fallback on the catalogue reads', () => {
    // These are the reads whose pages must survive a cold offline start.
    expect(hooks).toMatch(/placeholderData/);
    expect(hooks, 'optimized-setting needs its own offline fallback').toMatch(/isNetworkError/);
  });
});
