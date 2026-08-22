import type { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden } from './errors';
import { hasEntitlement } from './entitlements';

/**
 * Gated feature areas of the app, and the entitlement each one needs.
 *
 * Both of these run work on the user's own machine, so the client necessarily
 * decides when to start. What the server controls is authorisation: it refuses
 * to hand over the manifest, the files, or the go-ahead without an active
 * subscription, and it says so in one place rather than each route inventing
 * its own check.
 */
export const GATED_FEATURES = {
  multi_frame_generation: 'premium_optimization',
  windows_optimizer: 'one_click_optimization',
} as const;

export type GatedFeature = keyof typeof GATED_FEATURES;

export const GATED_FEATURE_KEYS = Object.keys(GATED_FEATURES) as GatedFeature[];

/**
 * preHandler that refuses the request unless the authenticated user holds the
 * entitlement backing `feature`. Must run after `authenticateUser`.
 */
export function requireFeature(feature: GatedFeature) {
  return async function featureGate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const userId = request.user?.id;
    // authenticateUser runs first and rejects anonymous requests; if it somehow
    // did not, refuse rather than treating "no user" as permitted.
    if (!userId) throw forbidden('An active subscription is required for this feature');
    if (!(await hasEntitlement(userId, GATED_FEATURES[feature]))) {
      throw forbidden('An active subscription is required for this feature');
    }
  };
}
