import { config } from '../../config';
import { AppError } from '../errors';
import type { PaymentProvider, PaymentRequestInput, PaymentRequestResult, PaymentVerifyInput, PaymentVerifyResult } from './provider';

/**
 * Zibal gateway (gateway.zibal.ir).
 *
 * Amounts are in Rial, which is already the unit plans are priced in, so the
 * figure passes through untouched. `ZIBAL_MERCHANT=zibal` is the gateway's own
 * test merchant: it walks the whole flow without moving money, which is what
 * makes an end-to-end test possible before a real merchant exists.
 *
 * `trackId` is Zibal's handle on the payment and is what `verifyPayment` is
 * called with later, so it is what gets stored as the provider reference.
 */
const BASE = 'https://gateway.zibal.ir';
const START = 'https://gateway.zibal.ir/start';

/** 100 is success. Everything else is a documented failure code. */
const OK = 100;
/** Verify returns this when the payment was already verified — not a failure. */
const ALREADY_VERIFIED = 201;

interface ZibalResponse {
  result?: number;
  message?: string;
  trackId?: number;
  amount?: number;
  status?: number;
  refNumber?: number | string;
  paidAt?: string;
}

async function call(path: string, payload: Record<string, unknown>): Promise<ZibalResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ merchant: config.ZIBAL_MERCHANT, ...payload }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // A timeout or DNS failure here is the gateway being unreachable, not the
    // user's payment failing — say so rather than reporting a declined card.
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', `Could not reach the payment gateway: ${String(err)}`);
  }
  if (!res.ok) {
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', `Payment gateway returned HTTP ${res.status}`);
  }
  return (await res.json()) as ZibalResponse;
}

export const zibalProvider: PaymentProvider = {
  name: 'zibal',

  async requestPayment(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    if (input.currency !== 'IRR') {
      throw new AppError(500, 'PAYMENT_PROVIDER_ERROR', `Zibal charges in IRR, plan is priced in ${input.currency}`);
    }
    const body = await call('/v1/request', {
      amount: input.amount,
      callbackUrl: input.callbackUrl,
      description: input.description,
      // Our own payment id, echoed back on the callback. Useful for tracing a
      // payment across both systems when something has to be reconciled.
      orderId: input.referenceId,
    });

    if (body.result !== OK || !body.trackId) {
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', `Zibal refused the payment request (${body.result}): ${body.message ?? 'no message'}`);
    }
    return {
      providerRef: String(body.trackId),
      redirectUrl: `${START}/${body.trackId}`,
      raw: body,
    };
  },

  /**
   * Zibal refuses a navigation that arrives with an empty `Referer`:
   * "امکان انجام تراکنش با Referrer خالی وجود ندارد". Opening the URL from the
   * desktop shell does exactly that — there is no page for the browser to say
   * it came from — so the payment page has to be reached via the bounce page.
   *
   * A trackId is always digits. Anything else is refused rather than
   * interpolated, so a corrupt reference cannot become part of a redirect.
   */
  gatewayUrl(providerRef: string): string | null {
    return /^\d+$/.test(providerRef) ? `${START}/${providerRef}` : null;
  },

  async verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
    const body = await call('/v1/verify', { trackId: Number(input.providerRef) });

    // A second verify of an already-verified payment is a success, not a
    // failure — the user refreshing the callback must not lose their purchase.
    const ok = body.result === OK || body.result === ALREADY_VERIFIED;
    if (!ok) {
      return { verified: false, raw: body };
    }

    // The gateway is the authority on what was actually paid. Trusting our own
    // expected amount would let a tampered or replayed callback activate a
    // subscription that was underpaid.
    if (typeof body.amount === 'number' && body.amount !== input.amount) {
      return { verified: false, raw: { ...body, mismatch: { expected: input.amount, paid: body.amount } } };
    }

    return {
      verified: true,
      providerTxId: body.refNumber === undefined ? undefined : String(body.refNumber),
      raw: body,
    };
  },
};
