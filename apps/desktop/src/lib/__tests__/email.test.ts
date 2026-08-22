import { describe, expect, it } from 'vitest';
import { isValidEmail } from '../passwordRules';

/**
 * The form's email check must agree with the server's, because disagreement is
 * invisible in both directions: too strict and the form rejects an address the
 * API would have accepted; too loose and the user gets a 400 instead of inline
 * feedback.
 */
describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    for (const good of [
      'user@example.com',
      'first.last@example.co.uk',
      'user+tag@example.org',
      'user_name@sub.domain.example',
      'omeedx1@gmail.com',
    ]) {
      expect(isValidEmail(good), good).toBe(true);
    }
  });

  it('rejects phone numbers, which no longer authenticate', () => {
    for (const bad of ['+989121112233', '09121112233', '989121112233']) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['', '   ', 'user', 'user@', '@example.com', 'user@example', 'a b@example.com', 'user@@example.com']) {
      expect(isValidEmail(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('ignores surrounding whitespace, as the server does', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true);
  });

  it('rejects an address past the length the server accepts', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});
