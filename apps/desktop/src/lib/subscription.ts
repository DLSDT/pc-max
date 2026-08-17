import type { MySubscription } from '@goh/types';
import { api } from './api';

/**
 * Short-TTL entitlement cache.
 *
 * The UI reads /me/subscription frequently (header badge, settings, storefront),
 * so we cache it for a few minutes to avoid hammering the API. This is a pure
 * UI optimization: the server remains authoritative — every package download
 * re-checks entitlement server-side, and the cache never gates anything.
 */
const TTL_MS = 5 * 60 * 1000;

let cached: { at: number; value: MySubscription | null } | null = null;

export async function getSubscription(force = false): Promise<MySubscription | null> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const value = await api.mySubscription();
    cached = { at: Date.now(), value };
    return value;
  } catch {
    // Offline / transient failure — fall back to the last known state.
    return cached?.value ?? null;
  }
}

/** Drop the cache after an action that may change entitlement (purchase, etc.). */
export function invalidateSubscriptionCache(): void {
  cached = null;
}
