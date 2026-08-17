import { randomUUID } from 'node:crypto';
import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uuidPk = () => uuid('id').primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Desktop devices (anonymous users). A future accounts table can extend this. */
export const users = pgTable('users', {
  id: uuidPk(),
  deviceId: text('device_id').notNull().unique(),
  platform: text('platform').notNull().default('windows'),
  appVersion: text('app_version'),
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

/** Refresh-token store (rotating sessions). */
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
  (t) => [index('views_game_viewed_idx').on(t.gameId, t.viewedAt), index('views_viewed_idx').on(t.viewedAt)],
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
