/**
 * Presenting a subscription plan to an Iranian customer.
 *
 * Two things arrive from the server in a shape the storefront cannot show
 * as-is.
 *
 * The name is English in the database ("1 Month"). Dropped into a
 * right-to-left block it renders with its parts in the other order, which is
 * why the Persian storefront read "Month 1". Translating by slug fixes the
 * reading without a migration and without deciding the customer's language on
 * the server; a plan slug we do not recognise falls back to whatever the
 * server called it.
 *
 * The price is stored and charged in rial, but Iran quotes everything in
 * toman. "2,690,000 IRR" beside a Persian sentence reads as ten times the real
 * price — the kind of mistake a customer only discovers after paying. Only the
 * display changes here: `plan.price` still goes to the gateway untouched.
 */

/** i18n key for a plan's display name. */
export function planNameKey(slug: string): string {
  return `subscription.plan.${slug}`;
}

/** True when the amount should be quoted in toman rather than a currency code. */
export function isToman(currency: string): boolean {
  return currency === 'IRR';
}

/**
 * The number to put on screen. Rial is the unit of record; toman is the unit
 * people read. Ten rial to the toman, so this is a display divide and nothing
 * else — never feed the result back into a purchase.
 */
export function displayAmount(price: number, currency: string): number {
  return isToman(currency) ? Math.round(price / 10) : price;
}
