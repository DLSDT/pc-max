import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment configuration — validated once at boot with Zod.
 * No secrets are hardcoded; production values must come from the environment.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .string()
    .default('postgres://goh:goh@localhost:5432/goh'),

  JWT_ACCESS_SECRET: z.string().min(16).default('dev-only-access-secret-change-me-in-production'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  CORS_ORIGINS: z.string().default(
    'http://localhost:3001,http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,http://tauri.localhost,https://tauri.localhost',
  ),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),

  ADMIN_BOOTSTRAP_EMAIL: z.string().email().default('admin@gamehub.local'),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).default('Admin123!'),

  // Payment system — provider-agnostic. `mock` auto-verifies (dev/tests);
  // `zarinpal` talks to the real gateway (sandbox by default).
  PAYMENT_PROVIDER: z.enum(['mock', 'zarinpal']).default('mock'),
  /** Consciously run the always-approve mock gateway in production — only ever
   *  correct while nobody is being charged (a free beta). Off by default so a
   *  paid deployment can't ship it by accident. */
  ALLOW_MOCK_PAYMENTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ZARINPAL_MERCHANT_ID: z.string().min(1).default('sandbox-test-merchant'),
  ZARINPAL_SANDBOX: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  ZARINPAL_CALLBACK_BASE_URL: z.string().default('http://localhost:4000'),

  // Secure downloads — package files are never served publicly; the download
  // endpoint returns short-lived signed URLs (HMAC for the local driver,
  // presigned GET for S3/R2).
  DOWNLOAD_SIGNING_SECRET: z.string().min(16).default('dev-only-download-secret-change-me-in-production'),
  DOWNLOAD_URL_TTL: z.coerce.number().int().min(60).max(86400).default(900),

  // Authentication hardening
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  /** Expose password-reset tokens in the API response (non-production only). */
  RESET_TOKEN_EXPOSE: z
    .enum(['true', 'false'])
    .default(process.env.NODE_ENV === 'production' ? 'false' : 'true')
    .transform((v) => v === 'true'),

  // SMS / OTP (phone authentication). Credentials are backend-only.
  // Email delivery. Credentials are backend-only, never exposed to clients.
  // `console` is a dev/test no-op (codes exposed via OTP_EXPOSE/RESET_TOKEN_EXPOSE);
  // production MUST use `smtp` (validated at boot below).
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().default('PC MAX <noreply@pcmax.rixy.ir>'),
  EMAIL_FROM_NAME: z.string().default('PC MAX'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** Public base URL used for password-reset links inside emails. */
  RESET_LINK_BASE_URL: z.string().default('https://pcmax.rixy.ir'),

  SMS_PROVIDER: z.enum(['console', 'kavenegar']).default('console'),
  KAVENEGAR_API_KEY: z.string().optional(),
  KAVENEGAR_SENDER: z.string().default('10004346'),
  /** Expose the OTP code in the API response (non-production only) so the
   *  dev/test loop works without a real SMS gateway. Never enabled in prod. */
  OTP_EXPOSE: z
    .enum(['true', 'false'])
    .default(process.env.NODE_ENV === 'production' ? 'false' : 'true')
    .transform((v) => v === 'true'),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  OTP_RESEND_COOLDOWN: z.coerce.number().int().min(10).max(3600).default(60),

  // ---- data retention (days) --------------------------------------------
  // These tables grow on every auth attempt and page view. Trimming keeps the
  // database, its backups and the queries that scan them from degrading as the
  // user base grows. Business data is never covered by these.
  RETENTION_OTP_DAYS: z.coerce.number().int().min(1).max(3650).default(7),
  RETENTION_LOGIN_ATTEMPT_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  RETENTION_SESSION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  RETENTION_VIEW_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
  RETENTION_CLIENT_ERROR_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  RETENTION_EMAIL_LOG_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  RETENTION_AUDIT_LOG_DAYS: z.coerce.number().int().min(1).max(3650).default(730),
  /** How often the API runs the trim. 0 disables the in-process schedule. */
  RETENTION_INTERVAL_HOURS: z.coerce.number().int().min(0).max(24 * 30).default(24),

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(300),
  /** Per-IP bound for the anonymous /views endpoint (abuse/analytics inflation). */
  RATE_LIMIT_VIEWS: z.coerce.number().int().min(1).max(10_000).default(120),
  /** Device registration inserts a users row; kept well under the global cap. */
  RATE_LIMIT_DEVICE: z.coerce.number().int().min(1).max(10_000).default(30),

  // Caching / performance (Phase 16). Shared Redis is optional — without it a
  // per-instance in-memory TTL cache is used. TTLs are kept short so admin
  // edits surface within seconds.
  REDIS_URL: z.string().optional(),
  CATALOG_CACHE_TTL: z.coerce.number().int().min(1).max(3600).default(30),
  CONFIG_CACHE_TTL: z.coerce.number().int().min(1).max(3600).default(60),

  // Monitoring (Phase 18) — Sentry. Optional; everything is redacted before
  // leaving the process (secrets stripped, emails masked).
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENV: z.string().default('development'),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.PAYMENT_PROVIDER === 'mock' && !parsed.data.ALLOW_MOCK_PAYMENTS) {
  // The mock gateway verifies EVERY payment, so running it in production hands
  // out real premium subscriptions for free — and nothing in the app looks
  // wrong while it happens. Refuse to boot instead.
  // eslint-disable-next-line no-console
  console.error(
    '❌ PAYMENT_PROVIDER=mock approves every payment and would grant paid subscriptions for free.\n' +
      '   Set PAYMENT_PROVIDER=zarinpal (with its credentials), or set ALLOW_MOCK_PAYMENTS=true\n' +
      '   to run a deliberately free beta where nobody is charged.',
  );
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_ACCESS_SECRET === 'dev-only-access-secret-change-me-in-production') {
  // eslint-disable-next-line no-console
  console.error('❌ JWT_ACCESS_SECRET must be overridden in production.');
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.DOWNLOAD_SIGNING_SECRET === 'dev-only-download-secret-change-me-in-production') {
  // eslint-disable-next-line no-console
  console.error('❌ DOWNLOAD_SIGNING_SECRET must be overridden in production.');
  process.exit(1);
}

// Production email guard: never ship the development (console) provider to
// production, and never start with SMTP configured but missing credentials.
if (parsed.data.NODE_ENV === 'production') {
  if (parsed.data.EMAIL_PROVIDER !== 'smtp') {
    // eslint-disable-next-line no-console
    console.error('❌ EMAIL_PROVIDER must be "smtp" in production (console is development-only).');
    process.exit(1);
  }
  if (!parsed.data.SMTP_HOST || !parsed.data.SMTP_USER || !parsed.data.SMTP_PASSWORD) {
    // eslint-disable-next-line no-console
    console.error('❌ SMTP_HOST / SMTP_USER / SMTP_PASSWORD are required in production.');
    process.exit(1);
  }
}

export const config = parsed.data;
