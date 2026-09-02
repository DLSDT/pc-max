/**
 * The rial/toman divide is the one number on the storefront a customer checks
 * against their bank statement, so the factor is pinned rather than trusted.
 */
import { describe, expect, it } from 'vitest';
import { displayAmount, isToman, planNameKey } from '../plans';

describe('plan pricing', () => {
  it('quotes rial prices in toman', () => {
    // The real catalogue: 29,900 toman a month up to 269,000 a year.
    expect(displayAmount(299_000, 'IRR')).toBe(29_900);
    expect(displayAmount(2_690_000, 'IRR')).toBe(269_000);
    // The 1,000-toman test price the client was shown.
    expect(displayAmount(10_000, 'IRR')).toBe(1_000);
  });

  it('leaves a currency that is not rial alone', () => {
    // Dividing a dollar price by ten would undercharge by 90% on screen.
    expect(displayAmount(25, 'USD')).toBe(25);
    expect(isToman('USD')).toBe(false);
  });

  it('rounds rather than showing a fraction of a toman', () => {
    expect(displayAmount(10_005, 'IRR')).toBe(1_001);
  });

  it('keys a plan name by its slug', () => {
    expect(planNameKey('12-months')).toBe('subscription.plan.12-months');
  });
});
