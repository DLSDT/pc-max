/**
 * Provider-agnostic payment abstraction.
 *
 * Business logic never talks to a gateway directly — it only depends on this
 * interface. Adding a new gateway later means implementing `PaymentProvider`
 * and registering it here; the subscription flow stays untouched.
 *
 * Security invariant: subscription activation NEVER trusts the client or the
 * bare callback. The callback handler calls `verifyPayment` (server-side) and
 * only then activates the subscription.
 */

export interface PaymentRequestInput {
  /** Server-side payment id — used as the provider reference. */
  referenceId: string;
  /** Amount in the plan's currency unit (IRR = Rial). */
  amount: number;
  currency: string;
  description: string;
  /** Where the provider redirects the user after the attempt. */
  callbackUrl: string;
}

export interface PaymentRequestResult {
  /** Provider-side reference (e.g. ZarinPal authority). */
  providerRef: string;
  /** Where the user must be sent to pay (null if already paid, e.g. mock). */
  redirectUrl: string | null;
  raw: unknown;
}

export interface PaymentVerifyInput {
  providerRef: string;
  amount: number;
  currency: string;
  /**
   * Our own payment id, echoed back by gateways that key a verification on the
   * merchant's order reference as well as their own (IDPay requires both).
   */
  orderId?: string;
}

export interface PaymentVerifyResult {
  verified: boolean;
  providerTxId?: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  requestPayment(input: PaymentRequestInput): Promise<PaymentRequestResult>;
  verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerifyResult>;
  /**
   * Rebuild the gateway page URL from the stored provider reference.
   *
   * Only for gateways that refuse a navigation arriving with an empty
   * `Referer` — Zibal does, which makes its payment page unreachable when the
   * desktop app hands the URL straight to the OS. Implementing this opts the
   * provider into the bounce page (see GET /payments/go/:paymentId), which
   * gives the browser a page on our own domain to come from.
   *
   * Returns null when the reference is not one this provider recognises, so a
   * malformed value can never be spliced into a redirect.
   */
  gatewayUrl?(providerRef: string): string | null;
}

import { idpayProvider } from './idpay';
import { mockProvider } from './mock';
import { zarinpalProvider } from './zarinpal';
import { zibalProvider } from './zibal';

/** Registry — extend here when a new gateway is added. */
const PROVIDERS: Record<string, () => PaymentProvider> = {
  mock: () => mockProvider,
  zarinpal: () => zarinpalProvider,
  zibal: () => zibalProvider,
  idpay: () => idpayProvider,
};

export function getPaymentProvider(name: string): PaymentProvider {
  const factory = PROVIDERS[name];
  if (!factory) throw new Error(`Unknown payment provider: ${name}`);
  return factory();
}
