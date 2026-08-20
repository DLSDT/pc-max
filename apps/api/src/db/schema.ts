import { randomUUID } from 'node:crypto';
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { Technologies } from '@goh/validation';

/**
 * Database schema — Game Optimization Hub.
 *
 * Columns are declared in camelCase and mapped to snake_case in PostgreSQL via
 * the `casing: 'snake_case'` option in both drizzle-kit and the drizzle client.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const gameStatusEnum = pgEnum('game_status', ['draft', 'published', 'archived']);
export const hardwareTierEnum = pgEnum('hardware_tier', ['low_end', 'mid_range', 'high_end', 'ultra']);
export const imageTypeEnum = pgEnum('image_type', ['cover', 'background', 'logo', 'screenshot']);
export const requirementTierEnum = pgEnum('requirement_tier', ['minimum', 'recommended']);
export const settingTypeEnum = pgEnum('setting_type', ['select', 'boolean', 'slider', 'text']);
export const profileStatusEnum = pgEnum('profile_status', ['draft', 'published', 'archived']);
export const adminRoleEnum = pgEnum('admin_role', ['super_admin', 'admin', 'editor', 'viewer']);
export const appChannelEnum = pgEnum('app_channel', ['stable', 'beta']);
export const userRoleEnum = pgEnum('user_role', ['user', 'moderator', 'support']);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended']);
export const planStatusEnum = pgEnum('plan_status', ['active', 'inactive']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['pending', 'active', 'expired', 'cancelled', 'suspended', 'refunded']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'paid', 'failed', 'refunded', 'expired']);
export const packageGpuVendorEnum = pgEnum('package_gpu_vendor', ['any', 'nvidia', 'amd', 'intel']);
export const packageArchEnum = pgEnum('package_arch', ['any', 'x64', 'arm64']);
/** What kind of optimization package this is — drives which product area
 * (Optimized Setting vs Multi-Frame Generation) surfaces it. */
export const packageKindEnum = pgEnum('package_kind', ['graphics', 'frame_generation', 'upscaler']);
export const fileOperationEnum = pgEnum('file_operation', ['replace', 'add']);
export const profileColorEnum = pgEnum('profile_color', ['yellow', 'green']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uuidPk = () => uuid('id').primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * End users. Accounts are phone-based (normalized international format,
 * unique). `email` is kept nullable for backward compatibility with legacy
 * email-registered accounts and the anonymous device rows — existing data is
 * never deleted during the phone migration. `deviceId` stays nullable because
 * registered users own devices separately (see `devices`).
 */
export const users = pgTable('users', {
  id: uuidPk(),
  deviceId: text('device_id').unique(),
  platform: text('platform').notNull().default('windows'),
  appVersion: text('app_version'),
  email: text('email').unique(),
  /** Normalized international phone (e.g. +989123456789). Unique when set. */
  phone: text('phone').unique(),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  /** True once the account's email identifier was verified via OTP. */
  emailVerified: boolean('email_verified').notNull().default(false),
  username: text('username').unique(),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').notNull().default('user'),
  status: userStatusEnum('status').notNull().default('active'),
  /** Bumped on password reset so every previously issued access token dies. */
  tokenVersion: integer('token_version').notNull().default(0),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Admin panel accounts. */
export const admins = pgTable('admins', {
  id: uuidPk(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: adminRoleEnum('role').notNull().default('viewer'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Refresh-token store (rotating sessions) — admin panel accounts. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuidPk(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_admin_idx').on(t.adminId)],
);

/** Refresh-token store (rotating sessions) — desktop end-user accounts. */
export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuidPk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('user_sessions_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

/** Browse categories (Action, Open World, RPG, …). */
export const categories = pgTable('categories', {
  id: uuidPk(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Free-form tags. */
export const tags = pgTable('tags', {
  id: uuidPk(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

/** Reusable groups for optimization settings (Graphics, Performance, …). */
export const optimizationCategories = pgTable('optimization_categories', {
  id: uuidPk(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export const games = pgTable(
  'games',
  {
    id: uuidPk(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    tagline: text('tagline'),
    description: text('description'),
    developer: text('developer'),
    publisher: text('publisher'),
    releaseDate: timestamp('release_date', { withTimezone: true, mode: 'date' }),
    engine: text('engine'),
    api: text('api'),
    technologies: jsonb('technologies').notNull().$type<Technologies>(),
    performanceRating: integer('performance_rating').notNull().default(50),
    /** Executable file names used for generic game detection (e.g. ["GTA5.exe"]). */
    executables: jsonb('executables').notNull().$type<string[]>().default([]),
    /** Launcher identifiers: Steam App ID / Epic App ID / generic launcher name. */
    steamAppId: text('steam_app_id'),
    epicAppId: text('epic_app_id'),
    /** Where the game is typically launched from (steam | epic | gog | standalone). */
    launcher: text('launcher'),
    featured: boolean('featured').notNull().default(false),
    status: gameStatusEnum('status').notNull().default('draft'),
    viewCount: integer('view_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('games_status_view_idx').on(t.status, t.viewCount),
    index('games_featured_idx').on(t.featured),
  ],
);

export const gameImages = pgTable(
  'game_images',
  {
    id: uuidPk(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    type: imageTypeEnum('type').notNull(),
    url: text('url').notNull(),
    objectKey: text('object_key'),
    altText: text('alt_text'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('game_images_game_idx').on(t.gameId)],
);

export const gameCategories = pgTable(
  'game_categories',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.categoryId] })],
);

export const gameTags = pgTable(
  'game_tags',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.tagId] })],
);

export const gameRequirements = pgTable(
  'game_requirements',
  {
    id: uuidPk(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    tier: requirementTierEnum('tier').notNull(),
    os: text('os').notNull(),
    cpu: text('cpu').notNull(),
    gpu: text('gpu').notNull(),
    ramGb: integer('ram_gb').notNull(),
    storageGb: integer('storage_gb').notNull(),
    directx: text('directx'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('game_requirements_game_tier_idx').on(t.gameId, t.tier)],
);

// ---------------------------------------------------------------------------
// Optimization profiles
// ---------------------------------------------------------------------------

export const optimizationProfiles = pgTable(
  'optimization_profiles',
  {
    id: uuidPk(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    targetFps: integer('target_fps'),
    hardwareTier: hardwareTierEnum('hardware_tier').notNull().default('mid_range'),
    version: text('version').notNull().default('1.0.0'),
    status: profileStatusEnum('status').notNull().default('draft'),
    colorProfile: profileColorEnum('color_profile'),
    isDefault: boolean('is_default').notNull().default(false),
    viewCount: integer('view_count').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [uniqueIndex('optimization_profiles_game_slug_idx').on(t.gameId, t.slug)],
);

/** Immutable snapshots of a profile at each released version. */
export const optimizationProfileVersions = pgTable(
  'optimization_profile_versions',
  {
    id: uuidPk(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => optimizationProfiles.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    changeNote: text('change_note'),
    data: jsonb('data').notNull(),
    createdBy: uuid('created_by').references(() => admins.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('optimization_profile_versions_profile_idx').on(t.profileId)],
);

export const optimizationSettings = pgTable(
  'optimization_settings',
  {
    id: uuidPk(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => optimizationProfiles.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => optimizationCategories.id, { onDelete: 'set null' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    type: settingTypeEnum('type').notNull().default('select'),
    value: text('value').notNull().default(''),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('optimization_settings_profile_idx').on(t.profileId)],
);

export const optimizationOptions = pgTable(
  'optimization_options',
  {
    id: uuidPk(),
    settingId: uuid('setting_id')
      .notNull()
      .references(() => optimizationSettings.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    label: text('label').notNull(),
    isRecommended: boolean('is_recommended').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('optimization_options_setting_idx').on(t.settingId),
    uniqueIndex('optimization_options_setting_value_idx').on(t.settingId, t.value),
  ],
);

// ---------------------------------------------------------------------------
// User activity
// ---------------------------------------------------------------------------

export const favorites = pgTable(
  'favorites',
  {
    id: uuidPk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('favorites_user_game_idx').on(t.userId, t.gameId)],
);

/** Append-only, privacy-friendly view events. */
export const views = pgTable(
  'views',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    gameId: uuid('game_id').references(() => games.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => optimizationProfiles.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('views_game_viewed_idx').on(t.gameId, t.viewedAt),
    index('views_viewed_idx').on(t.viewedAt),
    index('views_user_game_viewed_idx').on(t.userId, t.gameId, t.viewedAt),
  ],
);

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuidPk(),
    adminId: uuid('admin_id').references(() => admins.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_entity_idx').on(t.entityType, t.entityId), index('audit_logs_created_idx').on(t.createdAt)],
);

/**
 * Crash/error reports sent by the desktop client. Anonymous by design — the
 * deviceId is the client-generated install id already used for analytics, and
 * no message/stack is ever attributed to a named user. `fingerprint` groups
 * repeats of the same crash so the admin view can show "N occurrences".
 */
export const clientErrors = pgTable(
  'client_errors',
  {
    id: uuidPk(),
    fingerprint: text('fingerprint').notNull(),
    message: text('message').notNull(),
    stack: text('stack'),
    route: text('route'),
    appVersion: text('app_version'),
    platform: text('platform'),
    deviceId: text('device_id'),
    /** 'render' (ErrorBoundary), 'window' (onerror), 'promise' (unhandledrejection). */
    source: text('source').notNull().default('render'),
    occurrences: integer('occurrences').notNull().default(1),
    resolved: boolean('resolved').notNull().default(false),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('client_errors_fingerprint_idx').on(t.fingerprint),
    index('client_errors_last_seen_idx').on(t.lastSeenAt),
  ],
);

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export const appVersions = pgTable(
  'app_versions',
  {
    id: uuidPk(),
    version: text('version').notNull(),
    platform: text('platform').notNull().default('windows'),
    channel: appChannelEnum('channel').notNull().default('stable'),
    releaseNotes: text('release_notes'),
    downloadUrl: text('download_url').notNull(),
    checksumSha256: text('checksum_sha256'),
    minAppVersion: text('min_app_version'),
    isLatest: boolean('is_latest').notNull().default(false),
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('app_versions_platform_channel_version_idx').on(t.platform, t.channel, t.version)],
);

// ---------------------------------------------------------------------------
// Commercial layer — subscriptions, payments, entitlements, devices
// ---------------------------------------------------------------------------

/** Subscription plans — fully dynamic, managed from the admin panel. */
export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuidPk(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    durationDays: integer('duration_days').notNull(),
    price: bigint('price', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('IRR'),
    deviceLimit: integer('device_limit').notNull().default(1),
    features: jsonb('features').notNull().$type<string[]>(),
    status: planStatusEnum('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('subscription_plans_status_sort_idx').on(t.status, t.sortOrder)],
);

/** Payments — provider-agnostic. Activation is always server-side verified. */
export const payments = pgTable(
  'payments',
  {
    id: uuidPk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('IRR'),
    provider: text('provider').notNull(),
    status: paymentStatusEnum('status').notNull().default('pending'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    providerRef: text('provider_ref'),
    providerTxId: text('provider_tx_id'),
    refundedAt: timestamp('refunded_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('payments_user_idx').on(t.userId), index('payments_status_idx').on(t.status)],
);

/** Subscriptions — one row per purchase. Status drives entitlements. */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuidPk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
    startDate: timestamp('start_date', { withTimezone: true, mode: 'date' }).notNull(),
    expirationDate: timestamp('expiration_date', { withTimezone: true, mode: 'date' }).notNull(),
    status: subscriptionStatusEnum('status').notNull().default('pending'),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('subscriptions_user_idx').on(t.userId), index('subscriptions_expiration_idx').on(t.expirationDate)],
);

/** Raw provider transactions (append-only) for reconciliation/audit. */
export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: uuidPk(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    providerTxId: text('provider_tx_id'),
    providerStatus: text('provider_status'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('payment_transactions_payment_idx').on(t.paymentId)],
);

/** Feature grants derived from subscriptions (premium_optimization, …). */
export const entitlements = pgTable(
  'entitlements',
  {
    id: uuidPk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [index('entitlements_user_feature_idx').on(t.userId, t.feature)],
);

/** Registered devices bound to a user account (limit enforced per plan). */
export const devices = pgTable(
  'devices',
  {
    id: uuidPk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    name: text('name'),
    platform: text('platform').notNull().default('windows'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('devices_user_device_idx').on(t.userId, t.deviceId), index('devices_user_idx').on(t.userId)],
);

/** Per-device license grants for premium operations (server-side checked). */
export const licenseSessions = pgTable(
  'license_sessions',
  {
    id: uuidPk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (t) => [index('license_sessions_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------
// Security — login attempts & password resets
// ---------------------------------------------------------------------------

/** Failed login attempts for account lockout. */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    ip: text('ip'),
    success: boolean('success').notNull().default(false),
    attemptedAt: timestamp('attempted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('login_attempts_email_time_idx').on(t.email, t.attemptedAt)],
);

/** One-time passcodes for verification (register / password reset).
 *  Only the SHA-256 hash of the code is stored; codes are single-use,
 *  short-lived, attempt-limited and never logged or returned by the API
 *  (except a dev-only exposure in non-production). The identifier may be a
 *  normalized phone (`phone` column) or a normalized email (`email` column). */
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuidPk(),
    phone: text('phone'),
    email: text('email'),
    purpose: text('purpose').notNull(), // 'register' | 'reset'
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (t) => [index('otp_codes_phone_purpose_idx').on(t.phone, t.purpose), index('otp_codes_email_purpose_idx').on(t.email, t.purpose)],
);

/** Password reset tokens (only the hash is stored). */
export const passwordResets = pgTable('password_resets', {
  id: uuidPk(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
});

/** Safe email delivery log — masked recipient + status only, never codes/tokens. */
export const emailLogs = pgTable('email_logs', {
  id: uuidPk(),
  event: text('event').notNull(), // verification | password_reset | security | welcome | admin_test
  recipientHash: text('recipient_hash').notNull(),
  maskedRecipient: text('masked_recipient').notNull(),
  provider: text('provider').notNull(),
  status: text('status').notNull(), // sent | failed
  providerMessage: text('provider_message'),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Hardware profiles & optimization packages (file-based, manifest-driven)
// ---------------------------------------------------------------------------

/** Latest detected hardware snapshot per user (privacy-conscious: only what's
 *  needed for compatibility matching — no device serials or identifiers). */
export const hardwareProfiles = pgTable('hardware_profiles', {
  id: uuidPk(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  cpu: text('cpu'),
  gpuVendor: text('gpu_vendor'),
  gpuModel: text('gpu_model'),
  vramMb: integer('vram_mb'),
  ramGb: integer('ram_gb'),
  windowsVersion: text('windows_version'),
  arch: text('arch'),
  resolution: text('resolution'),
  driverVersion: text('driver_version'),
  detectedAt: timestamp('detected_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** File-based optimization packages with hardware compatibility metadata. */
export const optimizationPackages = pgTable(
  'optimization_packages',
  {
    id: uuidPk(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    version: text('version').notNull().default('1.0.0'),
    status: profileStatusEnum('status').notNull().default('draft'),
    kind: packageKindEnum('kind').notNull().default('graphics'),
    gpuVendor: packageGpuVendorEnum('gpu_vendor').notNull().default('any'),
    gpuFamily: text('gpu_family'),
    minVramMb: integer('min_vram_mb'),
    minRamGb: integer('min_ram_gb'),
    minWindows: text('min_windows'),
    gameVersion: text('game_version'),
    arch: packageArchEnum('arch').notNull().default('any'),
    targetResolution: text('target_resolution'),
    targetFps: integer('target_fps'),
    isDefault: boolean('is_default').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [uniqueIndex('optimization_packages_game_slug_idx').on(t.gameId, t.slug), index('optimization_packages_game_status_idx').on(t.gameId, t.status)],
);

/** Working-set files attached to a package before publication. */
export const packageFiles = pgTable(
  'package_files',
  {
    id: uuidPk(),
    packageId: uuid('package_id')
      .notNull()
      .references(() => optimizationPackages.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    sha256: text('sha256').notNull(),
    size: integer('size').notNull(),
    destination: text('destination').notNull(),
    operation: fileOperationEnum('operation').notNull().default('replace'),
    storageKey: text('storage_key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('package_files_package_idx').on(t.packageId)],
);

/** Immutable snapshots of a package at each released version (manifest). */
export const optimizationPackageVersions = pgTable(
  'optimization_package_versions',
  {
    id: uuidPk(),
    packageId: uuid('package_id')
      .notNull()
      .references(() => optimizationPackages.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    changeNote: text('change_note'),
    files: jsonb('files').notNull(),
    createdBy: uuid('created_by').references(() => admins.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('optimization_package_versions_package_idx').on(t.packageId)],
);

// ---------------------------------------------------------------------------
// Remote configuration (branding, theme, maintenance, min version, …)
// ---------------------------------------------------------------------------

/** Key/value remote config — everything the client renders can be changed
 *  here without rebuilding the desktop app. */
export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => admins.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});
