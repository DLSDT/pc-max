import { config } from '../../config';
import { AppError } from '../errors';
import type { PaymentProvider, PaymentRequestInput, PaymentRequestResult, PaymentVerifyInput, PaymentVerifyResult } from './provider';

/**
 * ZarinPal v4 REST gateway.
 *
 * Sandbox is the default; switch ZARINPAL_SANDBOX=false + a real merchant id in
 * production. The amount is passed in the plan currency (IRR = Rial) and the
 * provider is told the currency explicitly — no implicit unit assumptions.
 */
const API_PATH = '/pg/v4/payment';
const PAY_PATH = '/pg/StartPay';

function baseUrl(): string {
  return config.ZARINPAL_SANDBOX ? 'https://sandbox.zarinpal.com' : 'https://zarinpal.com';
}

interface ZarinpalEnvelope {
  data?: {
    authority?: string;
    code?: number;
    message?: string;
    ref_id?: number;
    fee?: number;
  };
  errors?: {
    code?: number;
    message?: string;
    validations?: unknown;
  };
}

async function call(path: string, payload: Record<string, unknown>): Promise<ZarinpalEnvelope> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ merchant_id: config.ZARINPAL_MERCHANT_ID, ...payload }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', `Payment gateway returned HTTP ${res.status}`);
  }
  return (await res.json()) as ZarinpalEnvelope;
}

export const zarinpalProvider: PaymentProvider = {
  name: 'zarinpal',

  async requestPayment(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const env = await call(`${API_PATH}/request.json`, {
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      callback_url: input.callbackUrl,
      metadata: { payment_id: input.referenceId },
    });

    if (!env.data?.authority) {
      const message = env.errors?.message ?? env.data?.message ?? 'Payment gateway request failed';
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', `Payment gateway error: ${message}`, env.errors);
    }

    return {
      providerRef: env.data.authority,
      redirectUrl: `${baseUrl()}${PAY_PATH}/${env.data.authority}`,
      raw: env,
    };
  },

  async verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
    const env = await call(`${API_PATH}/verify.json`, {
      amount: input.amount,
      authority: input.providerRef,
    });

    // 100 = success, 101 = already verified (idempotent re-verification).
    const code = env.data?.code ?? 0;
    return {
      verified: code === 100 || code === 101,
      providerTxId: env.data?.ref_id != null ? String(env.data.ref_id) : undefined,
      raw: env,
    };
  },
};
