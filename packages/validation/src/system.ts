import { z } from 'zod';
import { AppChannel, IsoDate, Semver } from './enums';
import { GameSummary } from './game';
import { Category } from './taxonomy';

/** Desktop release manifest entry. */
export const AppVersion = z.object({
  id: z.string().uuid(),
  version: Semver,
  platform: z.enum(['windows']),
  channel: AppChannel,
  releaseNotes: z.string().nullable(),
  downloadUrl: z.string().url(),
  checksumSha256: z.string().nullable(),
  minAppVersion: z.string().nullable(),
  isLatest: z.boolean(),
  releasedAt: IsoDate,
});
export type AppVersion = z.infer<typeof AppVersion>;

export const AppVersionCheckQuery = z.object({
  current: Semver.optional(),
  platform: z.enum(['windows']).default('windows'),
  channel: AppChannel.default('stable'),
});
export type AppVersionCheckQuery = z.infer<typeof AppVersionCheckQuery>;

export const AppVersionCheckResponse = z.object({
  latest: AppVersion.nullable(),
  updateAvailable: z.boolean(),
  current: z.string().nullable(),
});
export type AppVersionCheckResponse = z.infer<typeof AppVersionCheckResponse>;

export const AppVersionCreateInput = z.object({
  version: Semver,
  platform: z.enum(['windows']).default('windows'),
  channel: AppChannel.default('stable'),
  releaseNotes: z.string().trim().max(10_000).optional().nullable(),
  downloadUrl: z.string().url(),
  checksumSha256: z.string().trim().max(128).optional().nullable(),
  minAppVersion: z.string().trim().max(50).optional().nullable(),
});
export type AppVersionCreateInput = z.infer<typeof AppVersionCreateInput>;

export const AppVersionUpdateInput = AppVersionCreateInput.partial();
export type AppVersionUpdateInput = z.infer<typeof AppVersionUpdateInput>;

/** Public app settings. */
export const AppSettings = z.object({
  appName: z.string(),
  apiVersion: z.string(),
  contentUpdatedAt: IsoDate.nullable(),
});
export type AppSettings = z.infer<typeof AppSettings>;

/** Aggregated Home payload for the desktop app — one round trip. */
export const HomeResponse = z.object({
  featured: z.array(GameSummary),
  popular: z.array(GameSummary),
  recentlyAdded: z.array(GameSummary),
  categories: z.array(Category),
});
export type HomeResponse = z.infer<typeof HomeResponse>;
