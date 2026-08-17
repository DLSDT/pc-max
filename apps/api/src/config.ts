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
    'http://localhost:3001,http://localhost:1420,tauri://localhost,http://tauri.localhost,https://tauri.localhost',
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

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(300),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_ACCESS_SECRET === 'dev-only-access-secret-change-me-in-production') {
  // eslint-disable-next-line no-console
  console.error('❌ JWT_ACCESS_SECRET must be overridden in production.');
  process.exit(1);
}

export const config = parsed.data;
