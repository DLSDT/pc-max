/**
 * The installer's failures are the moment a user most needs to be spoken to in
 * their own language, so the translation path is pinned — including the two
 * ways it is allowed to give up.
 */
import { describe, expect, it } from 'vitest';
import { installErrorMessage } from '../installErrors';

/** Stand-in for i18next: knows one key, interpolates {{detail}}. */
const t = ((key: string, opts?: { detail?: string; defaultValue?: string }) => {
  if (key === 'mfg.err.outsideGameFolder') {
    return `این مسیر بیرون از پوشهٔ بازی است: ${opts?.detail ?? ''}`;
  }
  return opts?.defaultValue ?? key;
}) as unknown as Parameters<typeof installErrorMessage>[1];

describe('installErrorMessage', () => {
  it('translates a code and keeps the machine detail', () => {
    const msg = installErrorMessage(
      new Error('outside_game_folder|F:\\Arcade\\Beast of Reincarnation\\OptiScaler\\libxess_fg.dll'),
      t,
    );
    expect(msg).toContain('بیرون از پوشهٔ بازی');
    // The path is the one part translating would ruin.
    expect(msg).toContain('libxess_fg.dll');
  });

  it('leaves a message that is not code|detail alone', () => {
    // Errors also arrive from the API client and the Tauri bridge; mangling
    // those would trade one unreadable error for another.
    expect(installErrorMessage(new Error('Network request failed'), t)).toBe('Network request failed');
  });

  it('does not treat a bare path containing a pipe as a code', () => {
    expect(installErrorMessage(new Error('C:\\a|b failed'), t)).toBe('C:\\a|b failed');
  });

  it('falls back to something forwardable when the code has no translation', () => {
    // Better than showing "mfg.err.someNewCode" to a user who has to report it.
    const msg = installErrorMessage(new Error('some_new_code|/tmp/x'), t);
    expect(msg).toBe('some_new_code: /tmp/x');
  });

  it('handles a code with no detail', () => {
    expect(installErrorMessage(new Error('nothing_applies|'), t)).toBe('nothing_applies');
  });
});
