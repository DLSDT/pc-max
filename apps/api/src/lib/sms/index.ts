/**
 * SMS delivery abstraction. Authentication logic depends only on this
 * interface; concrete providers are wired via config. Credentials live
 * exclusively on the backend — never in the desktop application.
 */
import { config } from '../../config';
export interface SmsProvider {
  readonly name: string;
  /** Deliver a message. Implementations must never log the code itself. */
  send(phone: string, message: string): Promise<void>;
}

/**
 * Development provider — no external dependency. The code is intentionally NOT
 * logged here; in non-production the API response includes it (OTP_EXPOSE),
 * which keeps the dev loop fast without leaking codes through logs.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  async send(_phone: string, _message: string): Promise<void> {
    // no-op: the dev code is returned by the API via config.OTP_EXPOSE
  }
}

/** Build the configured provider (credentials are backend-only env vars). */
export function createSmsProvider(): SmsProvider {
  if (config.SMS_PROVIDER === 'kavenegar') {
    if (!config.KAVENEGAR_API_KEY) throw new Error('KAVENEGAR_API_KEY is required when SMS_PROVIDER=kavenegar');
    return new KavenegarProvider(config.KAVENEGAR_API_KEY, config.KAVENEGAR_SENDER);
  }
  return new ConsoleSmsProvider();
}

/** Kavenegar SMS gateway (https://kavenegar.com). */
export class KavenegarProvider implements SmsProvider {
  readonly name = 'kavenegar';
  private readonly apiKey: string;
  private readonly sender: string;

  constructor(apiKey: string, sender?: string) {
    this.apiKey = apiKey;
    this.sender = sender ?? '10004346';
  }

  async send(phone: string, message: string): Promise<void> {
    const url = `https://api.kavenegar.com/v1/${this.apiKey}/sms/send.json`;
    const body = new URLSearchParams({ receptor: phone, message, sender: this.sender });
    const res = await fetch(url, { method: 'POST', body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`SMS provider error (${res.status}): ${text.slice(0, 200)}`);
    }
  }
}
