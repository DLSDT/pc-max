/**
 * Phone normalization — every number is stored and looked up in one canonical
 * international form (`+989123456789`), so the same number written as
 * `09123456789`, `9123456789`, `+98 912 345 6789` or `00989123456789` always
 * resolves to the same account. Iranian mobile numbers (9XXXXXXXXX) are fully
 * supported; other international numbers are kept in E.164 (+country) form.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '');
  if (!digits) return null;

  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Iranian mobile: 98 + 9XXXXXXXXX.
  if (digits.startsWith('98')) {
    const rest = digits.slice(2);
    if (/^9\d{9}$/.test(rest)) return `+98${rest}`;
    return null;
  }
  // Local Iranian number with or without leading 0.
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (/^9\d{9}$/.test(digits)) return `+98${digits}`;

  // Generic E.164-ish international number (country code + subscriber).
  if (/^\d{8,15}$/.test(digits)) return `+${digits}`;
  return null;
}
