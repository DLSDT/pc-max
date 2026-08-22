/**
 * Email delivery for PC MAX.
 *
 * Authentication logic depends only on the `MailProvider` interface; concrete
 * providers are wired via config. Credentials live exclusively on the backend
 * and are NEVER exposed to any client. Every send is logged to `email_logs`
 * (masked recipient, never the code/token itself); delivery failures are
 * logged server-side and surfaced to the caller as a safe generic result —
 * the request handler never sees a stack trace.
 */
import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { db } from '../db';
import { emailLogs } from '../db/schema';
import { config } from '../config';

export interface MailProvider {
  readonly name: string;
  /** Deliver an HTML message. Implementations must never log the body. */
  send(to: string, subject: string, html: string): Promise<void>;
}

/** Development provider — no external dependency. Codes are exposed to the
 *  caller via OTP_EXPOSE/RESET_TOKEN_EXPOSE, never logged here. */
export class ConsoleMailProvider implements MailProvider {
  readonly name = 'console';
  async send(_to: string, _subject: string, _html: string): Promise<void> {
    // no-op
  }
}

/** SMTP provider via nodemailer. Credentials come from env only. */
export class SmtpMailProvider implements MailProvider {
  readonly name = 'smtp';
  private readonly transporter: import('nodemailer').Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
      // Bound every stage. With no timeouts nodemailer waits forever, so a
      // slow relay or an address whose domain does not resolve holds the
      // user's request open until their client gives up — measured at two
      // minutes against the live server for a mistyped domain.
      connectionTimeout: config.SMTP_TIMEOUT_MS,
      greetingTimeout: config.SMTP_TIMEOUT_MS,
      socketTimeout: config.SMTP_TIMEOUT_MS,
    });
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: config.EMAIL_FROM,
      to,
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
  }
}

/** Build the configured provider. */
export function createMailProvider(): MailProvider {
  if (config.EMAIL_PROVIDER === 'smtp') {
    if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASSWORD) {
      throw new Error('SMTP_HOST / SMTP_USER / SMTP_PASSWORD are required when EMAIL_PROVIDER=smtp');
    }
    return new SmtpMailProvider();
  }
  return new ConsoleMailProvider();
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Mask an address for logs: g***r@example.com / +98*****000. */
export function maskRecipient(recipient: string): string {
  const at = recipient.lastIndexOf('@');
  if (at > 0) {
    const local = recipient.slice(0, at);
    const domain = recipient.slice(at);
    return `${local.slice(0, 1)}***${local.slice(-1)}${domain}`;
  }
  if (recipient.length > 8) {
    return `${recipient.slice(0, 4)}****${recipient.slice(-3)}`;
  }
  return '***';
}

export type EmailEvent = 'verification' | 'password_reset' | 'security' | 'welcome' | 'admin_test';

/**
 * Deliver an email with delivery logging. NEVER throws to the caller: a
 * delivery failure is logged server-side and reported as `{ ok: false }` so
 * the API can return a safe generic message. No credentials or tokens are
 * stored in the log — only a hash + masked recipient.
 */
export async function deliverEmail(
  to: string,
  subject: string,
  html: string,
  event: EmailEvent,
  provider: MailProvider,
): Promise<{ ok: boolean; error?: string }> {
  // The audit row is best effort in BOTH directions. It used to be inside the
  // success path's try, so a hiccup writing the log turned a message that had
  // already left the server into a reported failure — and the caller then
  // retries, sending the user a second code while the first one is in flight.
  async function record(status: 'sent' | 'failed', providerMessage?: string) {
    try {
      await db.insert(emailLogs).values({
        event,
        recipientHash: sha256(to),
        maskedRecipient: maskRecipient(to),
        provider: provider.name,
        status,
        ...(providerMessage ? { providerMessage } : {}),
      });
    } catch (logErr) {
      // Logging must never change the outcome of the send.
      console.error(`[email] could not record ${event} ${status} log: ${String(logErr).slice(0, 200)}`);
    }
  }

  try {
    await provider.send(to, subject, html);
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : 'unknown error';
    // Server-side log only — never returned to the user, never a stack trace.
    console.error(`[email] ${event} delivery failed for ${maskRecipient(to)}: ${message}`);
    await record('failed', message);
    return { ok: false, error: message };
  }

  await record('sent');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Centralized PC MAX templates (single source, PC MAX branding).
// ---------------------------------------------------------------------------

const BRAND_RED = '#E50914';

function shell(html: string): string {
  return `<!doctype html>
<html dir="auto">
<body style="margin:0;padding:0;background:#F8F9FA;font-family:Segoe UI,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FA;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
          <tr>
            <td style="background:${BRAND_RED};padding:22px 28px;">
              <span style="color:#FFFFFF;font-size:22px;font-weight:800;letter-spacing:1px;">PC MAX</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${html}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;border-top:1px solid #E5E7EB;background:#F8F9FA;">
              <p style="margin:0;font-size:12px;color:#6B7280;line-height:1.6;">
                If you did not request this email, you can safely ignore it.<br/>
                Never share verification codes or reset links with anyone.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:10px;background:${BRAND_RED};">
    <a href="${href}" style="display:inline-block;padding:12px 28px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;border-radius:10px;">${label}</a>
  </td></tr></table>`;
}

function notice(message: string): string {
  return `<p style="margin:18px 0 0;padding:12px 16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;font-size:13px;color:#B91C1C;line-height:1.6;">${message}</p>`;
}

/** 1. Email verification (registration). */
export function renderVerificationEmail(identifier: string, code: string, expiresMinutes: number): string {
  return shell(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;">Verify your email</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#4B5563;line-height:1.6;">Welcome to PC MAX! Use the code below to finish creating your account for <strong dir="ltr">${identifier}</strong>.</p>
    <p style="margin:24px 0;padding:16px;background:#F8F9FA;border:1px solid #E5E7EB;border-radius:10px;font-size:26px;font-weight:800;letter-spacing:8px;text-align:center;color:#111827;" dir="ltr">${code}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">This code expires in <strong>${expiresMinutes} minutes</strong> and can only be used once.</p>
    ${notice('PC MAX will never ask you for this code outside the application.')}
  `);
}

/** 2. Password reset — secure one-time link + fallback code. */
export function renderPasswordResetEmail(identifier: string, link: string, code: string, expiresMinutes: number): string {
  return shell(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;">Reset your PC MAX password</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#4B5563;line-height:1.6;">We received a request to reset the password for <strong dir="ltr">${identifier}</strong>.</p>
    ${button(link, 'Reset Password')}
    <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">This link expires in <strong>${expiresMinutes} minutes</strong> and works only once.</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">Prefer a code? Enter this in the app instead: <strong dir="ltr">${code}</strong></p>
    ${notice('If you did not request a password reset, you can safely ignore this email — your password will not change.')}
  `);
}

/** 3. Security notification (e.g. new-device login). */
export function renderSecurityNotification(identifier: string, message: string): string {
  return shell(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;">Security notice</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#4B5563;line-height:1.6;">${message}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">Account: <strong dir="ltr">${identifier}</strong></p>
    ${notice('If this was not you, sign in and change your password immediately.')}
  `);
}

/** 4. Optional welcome email. */
export function renderWelcomeEmail(identifier: string): string {
  return shell(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;">Welcome to PC MAX</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#4B5563;line-height:1.6;">Your account is ready, <strong dir="ltr">${identifier}</strong>. Discover optimized settings for your favorite games and unlock premium performance.</p>
    ${button(`${config.RESET_LINK_BASE_URL}/games`, 'Browse Games')}
  `);
}

/** Admin test email. */
export function renderAdminTestEmail(identifier: string): string {
  return shell(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;">PC MAX email test</h1>
    <p style="margin:0 0 8px;font-size:14px;color:#4B5563;line-height:1.6;">This is a test message from the PC MAX admin panel. If you are reading this, the email provider is configured correctly.</p>
    <p style="margin:0;font-size:13px;color:#6B7280;">Delivered to: <strong dir="ltr">${identifier}</strong></p>
  `);
}

/** Cryptographically secure single-use token. */
export function generateSecureToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: sha256(token) };
}
