import { z } from 'zod';
import { PaymentStatus } from './enums';

/** Provider callback payload — the payment gateway hits this after the user
 *  finishes (or aborts) payment. Activation is ALWAYS server-side: this
 *  endpoint re-verifies with the provider before touching the subscription. */
export const PaymentCallbackInput = z.object({
  provider: z.enum(['mock', 'zarinpal']),
  authority: z.string().trim().min(1).optional(),
  paymentId: z.string().uuid().optional(),
  status: z.string().optional(),
});
export type PaymentCallbackInput = z.infer<typeof PaymentCallbackInput>;

/** Public payment record shown to admins (never exposes secrets). */
export const PaymentPublic = z.object({
  id: z.string().uuid(),
  amount: z.number().int(),
  currency: z.string(),
  provider: z.string(),
  status: PaymentStatus,
  providerRef: z.string().nullable(),
  createdAt: z.string(),
});
export type PaymentPublic = z.infer<typeof PaymentPublic>;

/** Verify result returned to the caller (usually a redirect page). */
export const PaymentVerifyResponse = z.object({
  ok: z.boolean(),
  paymentId: z.string().uuid(),
  subscriptionId: z.string().uuid().nullable(),
  message: z.string(),
});
export type PaymentVerifyResponse = z.infer<typeof PaymentVerifyResponse>;
