import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPasswordOrDecoy } from '../password';

describe('verifyPasswordOrDecoy', () => {
  it('accepts the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPasswordOrDecoy('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPasswordOrDecoy('wrong', hash)).toBe(false);
  });

  it('returns false instead of throwing when the account has no password', async () => {
    // Device-registered rows have a null password_hash. Passing that straight
    // to argon2 throws, which surfaced as a 500 from /auth/login rather than
    // the intended 401.
    for (const missing of [null, undefined, '']) {
      await expect(verifyPasswordOrDecoy('anything', missing)).resolves.toBe(false);
    }
  });

  it('spends comparable time on a missing hash as on a real mismatch', async () => {
    // The point of the decoy: a nonexistent account must not answer faster
    // than a real one with a bad password, or timing enumerates registrations.
    const hash = await hashPassword('some password');
    const time = async (fn: () => Promise<unknown>) => {
      const t0 = performance.now();
      await fn();
      return performance.now() - t0;
    };
    await time(() => verifyPasswordOrDecoy('warmup', hash)); // prime the decoy hash

    const miss = await time(() => verifyPasswordOrDecoy('guess', null));
    const mismatch = await time(() => verifyPasswordOrDecoy('guess', hash));

    // Same order of magnitude is what matters; exact parity is not achievable
    // and CI timing is noisy, so this only catches the decoy being skipped
    // entirely (which shows up as a sub-millisecond miss).
    expect(miss).toBeGreaterThan(mismatch / 10);
  });
});
