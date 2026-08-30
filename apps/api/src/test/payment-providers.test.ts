/**
 * Zibal and IDPay, against a stubbed `fetch`.
 *
 * These decide whether a subscription is granted, so the cases that matter are
 * the ones where the gateway says something other than plain success: an
 * underpayment, a replay, a refusal. Getting a happy path right is not the
 * hard part — silently accepting a bad one is.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;

/** Queue one JSON response per expected call. */
function firstCall<T>(calls: T[]): T {
  const c = calls[0];
  if (!c) throw new Error('expected the provider to call the gateway, but it never did');
  return c;
}

function stubFetch(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  let i = 0;
  globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
    const opts = (init ?? {}) as { body?: string; headers?: Record<string, string> };
    calls.push({
      url: String(url),
      body: opts.body ? JSON.parse(opts.body) : undefined,
      headers: opts.headers ?? {},
    });
    const next = responses[i++] ?? { body: {} };
    return {
      ok: (next.status ?? 200) < 400,
      status: next.status ?? 200,
      json: async () => next.body,
    } as unknown as Response;
  }) as typeof fetch;
  return calls;
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('zibal', () => {
  it('starts a payment and points the user at the gateway', async () => {
    const calls = stubFetch([{ body: { result: 100, trackId: 987654 } }]);
    const { zibalProvider } = await import('../lib/payments/zibal');

    const res = await zibalProvider.requestPayment({
      referenceId: 'pay-1', amount: 10_000, currency: 'IRR',
      description: 'x', callbackUrl: 'https://cianet.ir/cb',
    });

    expect(res.providerRef).toBe('987654');
    expect(res.redirectUrl).toBe('https://gateway.zibal.ir/start/987654');
    // Rial passes through untouched — a x10 slip here overcharges by an order
    // of magnitude and would only be noticed by the person paying.
    expect((firstCall(calls).body as { amount: number }).amount).toBe(10_000);
    expect((firstCall(calls).body as { orderId: string }).orderId).toBe('pay-1');
  });

  it('refuses to start when the gateway rejects the request', async () => {
    stubFetch([{ body: { result: 102, message: 'merchant not found' } }]);
    const { zibalProvider } = await import('../lib/payments/zibal');
    await expect(zibalProvider.requestPayment({
      referenceId: 'pay-1', amount: 10_000, currency: 'IRR',
      description: 'x', callbackUrl: 'https://cianet.ir/cb',
    })).rejects.toThrow(/refused the payment request/);
  });

  it('verifies a paid transaction', async () => {
    stubFetch([{ body: { result: 100, amount: 10_000, refNumber: 55 } }]);
    const { zibalProvider } = await import('../lib/payments/zibal');
    const res = await zibalProvider.verifyPayment({ providerRef: '987654', amount: 10_000, currency: 'IRR' });
    expect(res.verified).toBe(true);
    expect(res.providerTxId).toBe('55');
  });

  it('treats an already-verified payment as verified', async () => {
    // The user refreshing the callback page must not lose a purchase they made.
    stubFetch([{ body: { result: 201, amount: 10_000 } }]);
    const { zibalProvider } = await import('../lib/payments/zibal');
    expect((await zibalProvider.verifyPayment({ providerRef: '1', amount: 10_000, currency: 'IRR' })).verified).toBe(true);
  });

  it('refuses when the gateway reports a smaller amount than the plan costs', async () => {
    // The gateway is the authority on what was paid. Believing our own figure
    // would activate a subscription for whatever the user actually sent.
    stubFetch([{ body: { result: 100, amount: 1_000 } }]);
    const { zibalProvider } = await import('../lib/payments/zibal');
    const res = await zibalProvider.verifyPayment({ providerRef: '1', amount: 10_000, currency: 'IRR' });
    expect(res.verified).toBe(false);
  });

  it('refuses an unpaid transaction', async () => {
    stubFetch([{ body: { result: 202, message: 'not paid' } }]);
    const { zibalProvider } = await import('../lib/payments/zibal');
    expect((await zibalProvider.verifyPayment({ providerRef: '1', amount: 10_000, currency: 'IRR' })).verified).toBe(false);
  });

  it('rebuilds the gateway page url from a stored track id', async () => {
    // The bounce page exists because Zibal refuses an empty Referer; it can
    // only send the user on if the URL can be rebuilt from what we stored.
    const { zibalProvider } = await import('../lib/payments/zibal');
    expect(zibalProvider.gatewayUrl?.('987654')).toBe('https://gateway.zibal.ir/start/987654');
  });

  it('refuses to rebuild a gateway url from a reference that is not a track id', async () => {
    // The result is interpolated into a redirect and into an href, so anything
    // that is not plainly a track id has to be turned away rather than escaped.
    const { zibalProvider } = await import('../lib/payments/zibal');
    for (const bad of ['', '1/../evil', 'javascript:alert(1)', '12 34', 'https://evil.example']) {
      expect(zibalProvider.gatewayUrl?.(bad)).toBeNull();
    }
  });

  it('rejects a plan priced in anything but rial', async () => {
    stubFetch([]);
    const { zibalProvider } = await import('../lib/payments/zibal');
    await expect(zibalProvider.requestPayment({
      referenceId: 'p', amount: 5, currency: 'USD', description: 'x', callbackUrl: 'https://cianet.ir/cb',
    })).rejects.toThrow(/IRR/);
  });

  it('reports an unreachable gateway as a gateway fault', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT'); }) as typeof fetch;
    const { zibalProvider } = await import('../lib/payments/zibal');
    await expect(zibalProvider.requestPayment({
      referenceId: 'p', amount: 10_000, currency: 'IRR', description: 'x', callbackUrl: 'https://cianet.ir/cb',
    })).rejects.toThrow(/Could not reach the payment gateway/);
  });
});

describe('idpay', () => {
  beforeEach(() => { process.env.IDPAY_API_KEY = 'test-key'; });

  it('starts a payment and returns the gateway link', async () => {
    const calls = stubFetch([{ status: 201, body: { id: 'idp-1', link: 'https://idpay.ir/p/idp-1' } }]);
    const { idpayProvider } = await import('../lib/payments/idpay');

    const res = await idpayProvider.requestPayment({
      referenceId: 'pay-1', amount: 10_000, currency: 'IRR',
      description: 'x', callbackUrl: 'https://cianet.ir/cb',
    });

    expect(res.providerRef).toBe('idp-1');
    expect(res.redirectUrl).toBe('https://idpay.ir/p/idp-1');
    expect((firstCall(calls).body as { amount: number }).amount).toBe(10_000);
    expect(firstCall(calls).headers['X-API-KEY']).toBe('test-key');
  });

  it('refuses to start when the gateway returns an error code', async () => {
    stubFetch([{ status: 400, body: { error_code: 34, error_message: 'amount too low' } }]);
    const { idpayProvider } = await import('../lib/payments/idpay');
    await expect(idpayProvider.requestPayment({
      referenceId: 'p', amount: 10, currency: 'IRR', description: 'x', callbackUrl: 'https://cianet.ir/cb',
    })).rejects.toThrow(/amount too low/);
  });

  it('sends our order id alongside the gateway id at verify time', async () => {
    // IDPay verifies against both and refuses with only its own reference.
    const calls = stubFetch([{ body: { status: 100, amount: 10_000, track_id: 42 } }]);
    const { idpayProvider } = await import('../lib/payments/idpay');
    const res = await idpayProvider.verifyPayment({
      providerRef: 'idp-1', amount: 10_000, currency: 'IRR', orderId: 'pay-1',
    });
    expect(res.verified).toBe(true);
    expect(res.providerTxId).toBe('42');
    expect(firstCall(calls).body).toMatchObject({ id: 'idp-1', order_id: 'pay-1' });
  });

  it('refuses when the gateway reports a smaller amount than the plan costs', async () => {
    stubFetch([{ body: { status: 100, amount: '1000' } }]);
    const { idpayProvider } = await import('../lib/payments/idpay');
    expect((await idpayProvider.verifyPayment({
      providerRef: 'idp-1', amount: 10_000, currency: 'IRR', orderId: 'p',
    })).verified).toBe(false);
  });

  it('refuses a status that does not mean paid', async () => {
    // 10 is "awaiting confirmation" — not money in the account.
    stubFetch([{ body: { status: 10, amount: 10_000 } }]);
    const { idpayProvider } = await import('../lib/payments/idpay');
    expect((await idpayProvider.verifyPayment({
      providerRef: 'idp-1', amount: 10_000, currency: 'IRR', orderId: 'p',
    })).verified).toBe(false);
  });

  it('refuses to start without an API key', async () => {
    process.env.IDPAY_API_KEY = '';
    stubFetch([]);
    const { idpayProvider } = await import('../lib/payments/idpay');
    await expect(idpayProvider.requestPayment({
      referenceId: 'p', amount: 10_000, currency: 'IRR', description: 'x', callbackUrl: 'https://cianet.ir/cb',
    })).rejects.toThrow(/IDPAY_API_KEY/);
  });
});

describe('the provider registry', () => {
  it('resolves every gateway the config allows', async () => {
    // A name accepted by config but missing from the registry throws at the
    // first purchase attempt, in production, on a real customer.
    const { getPaymentProvider } = await import('../lib/payments/provider');
    for (const name of ['mock', 'zarinpal', 'zibal', 'idpay']) {
      expect(getPaymentProvider(name).name).toBe(name);
    }
  });
});
