import { config } from '../../config';
import { AppError } from '../errors';
import type { PaymentProvider, PaymentRequestInput, PaymentRequestResult, PaymentVerifyInput, PaymentVerifyResult } from './provider';

/**
 * IDPay gateway (api.idpay.ir, v1.1).
 *
 * Amounts are in Rial, which plans are already priced in. Sandbox mode is a
 * header rather than a different host, so the same API key walks the whole
 * flow without money moving — set IDPAY_SANDBOX=false to go live.
 *
 * IDPay returns its own `id` for the transaction and expects it back, paired
 * with our `order_id`, at verify time. The `id` is what gets stored as the
 * provider reference; `order_id` is our payment row id, which is what lets a
 * callback be matched to a payment even when the reference is missing.
 */
const BASE = 'https://api.idpay.ir/v1.1';

/** Verify outcomes that mean the money is ours. */
const VERIFIED = new Set([100, 101, 200]);

interface IdpayResponse {
  id?: string;
  link?: string;
  status?: number;
  track_id?: string | number;
  order_id?: string;
  amount?: string | number;
  error_code?: number;
  error_message?: string;
}

async function call(path: string, payload: Record<string, unknown>): Promise<IdpayResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-API-KEY': config.IDPAY_API_KEY ?? '',
        ...(config.IDPAY_SANDBOX ? { 'X-SANDBOX': '1' } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // Unreachable gateway, not a declined payment — the distinction matters to
    // whoever reads the error.
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', `Could not reach the payment gateway: ${String(err)}`);
  }
  const body = (await res.json().catch(() => ({}))) as IdpayResponse;
  // IDPay reports failures in the body with a non-2xx status, so the message is
  // worth surfacing rather than just the code.
  if (!res.ok && body.error_code === undefined) {
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', `Payment gateway returned HTTP ${res.status}`);
  }
  return body;
}

export const idpayProvider: PaymentProvider = {
  name: 'idpay',

  async requestPayment(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    if (input.currency !== 'IRR') {
      throw new AppError(500, 'PAYMENT_PROVIDER_ERROR', `IDPay charges in IRR, plan is priced in ${input.currency}`);
    }
    if (!config.IDPAY_API_KEY) {
      throw new AppError(500, 'PAYMENT_PROVIDER_ERROR', 'IDPAY_API_KEY is not set');
    }

    const body = await call('/payment', {
      order_id: input.referenceId,
      amount: input.amount,
      callback: input.callbackUrl,
      desc: input.description,
    });

    if (body.error_code !== undefined || !body.id || !body.link) {
      throw new AppError(
        502,
        'PAYMENT_PROVIDER_ERROR',
        `IDPay refused the payment request (${body.error_code ?? 'no code'}): ${body.error_message ?? 'no message'}`,
      );
    }
    return { providerRef: body.id, redirectUrl: body.link, raw: body };
  },

  async verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
    const body = await call('/payment/verify', {
      id: input.providerRef,
      order_id: input.orderId ?? '',
    });

    if (body.error_code !== undefined || body.status === undefined || !VERIFIED.has(Number(body.status))) {
      return { verified: false, raw: body };
    }

    // The gateway is the authority on what was paid. Skipping this would let a
    // replayed or tampered callback activate a subscription that was underpaid.
    const paid = Number(body.amount);
    if (Number.isFinite(paid) && paid !== input.amount) {
      return { verified: false, raw: { ...body, mismatch: { expected: input.amount, paid } } };
    }

    return {
      verified: true,
      providerTxId: body.track_id === undefined ? undefined : String(body.track_id),
      raw: body,
    };
  },
};
