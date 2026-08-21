import { describe, expect, it } from 'vitest';
import { deliverEmail, maskRecipient } from '../email';

/**
 * A failed send must be visible. The OTP path used to call deliverEmail and
 * discard its result, so a rejected SMTP handshake still answered the user
 * "code sent" — leaving them waiting for mail that never arrives, with the
 * only trace a row in email_logs nobody reads.
 */
const failing = {
  name: 'failing-test-provider',
  send: async () => {
    throw new Error('535 Authentication credentials invalid');
  },
};

const working = { name: 'ok-test-provider', send: async () => undefined };

describe('deliverEmail', () => {
  it('reports a transport failure instead of swallowing it', async () => {
    const res = await deliverEmail('someone@example.test', 'Subject', '<p>body</p>', 'verification', failing);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('reports success when the provider accepts the message', async () => {
    const res = await deliverEmail('someone@example.test', 'Subject', '<p>body</p>', 'verification', working);
    expect(res.ok).toBe(true);
  });

  it('still reports success when the audit row cannot be written', async () => {
    // There is no database in this test, so every emailLogs insert throws.
    // That used to sit inside the success path's try block, turning a message
    // that had already left the server into a reported failure — and the OTP
    // caller then retries, sending a second code while the first is in flight.
    const res = await deliverEmail('someone@example.test', 'Subject', '<p>body</p>', 'verification', working);
    expect(res.ok, 'a failed log write must not invert the send result').toBe(true);
  });

  it('never logs the raw recipient', () => {
    // email_logs stores a hash plus this mask; the address itself is not kept.
    const masked = maskRecipient('omeedreza@example.com');
    expect(masked).not.toBe('omeedreza@example.com');
    expect(masked).toContain('@example.com');
    expect(masked).toContain('*');
  });
});
