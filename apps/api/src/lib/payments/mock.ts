import { randomUUID } from 'node:crypto';
import { config } from '../../config';
import type { PaymentProvider, PaymentRequestInput, PaymentRequestResult, PaymentVerifyInput, PaymentVerifyResult } from './provider';

/**
 * Mock provider — used in development and integration tests (PAYMENT_PROVIDER
 * defaults to `mock`). Every payment "succeeds" so the full activation flow can
 * be exercised end-to-end without a merchant account.
 */
export const mockProvider: PaymentProvider = {
  name: 'mock',

  async requestPayment(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const authority = `MOCK-${randomUUID()}`;
    return {
      providerRef: authority,
      redirectUrl: `${config.ZARINPAL_CALLBACK_BASE_URL}/api/v1/payments/mock/callback?paymentId=${input.referenceId}`,
      raw: { authority, mock: true },
    };
  },

  async verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
    return {
      verified: true,
      providerTxId: `MOCKTX-${randomUUID()}`,
      raw: { authority: input.providerRef, verified: true, mock: true },
    };
  },
};
