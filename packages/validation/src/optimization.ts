import { z } from 'zod';
import { HardwareTier, IsoDate, ProfileStatus, Semver, SettingType } from './enums';

export const OptimizationOption = z.object({
  id: z.string().uuid(),
  value: z.string(),
  label: z.string(),
  isRecommended: z.boolean(),
  sortOrder: z.number().int(),
});
export type OptimizationOption = z.infer<typeof OptimizationOption>;

export const OptimizationSetting = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  type: SettingType,
  value: z.string(),
  description: z.string().nullable(),
  category: z
    .object({
      slug: z.string(),
      name: z.string(),
    })
    .nullable(),
  sortOrder: z.number().int(),
  options: z.array(OptimizationOption),
});
export type OptimizationSetting = z.infer<typeof OptimizationSetting>;

export const OptimizationProfile = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  targetFps: z.number().int().nullable(),
  hardwareTier: HardwareTier,
  version: Semver,
  status: ProfileStatus,
  isDefault: z.boolean(),
  viewCount: z.number().int(),
  publishedAt: IsoDate.nullable(),
  updatedAt: IsoDate,
  settings: z.array(OptimizationSetting),
});
export type OptimizationProfile = z.infer<typeof OptimizationProfile>;

export const OptimizationProfileSummary = OptimizationProfile.omit({ settings: true });
export type OptimizationProfileSummary = z.infer<typeof OptimizationProfileSummary>;

export const ProfileListResponse = z.object({
  data: z.array(OptimizationProfile),
});
export type ProfileListResponse = z.infer<typeof ProfileListResponse>;

/** Admin payloads. */
export const ProfileCreateInput = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case'),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional().nullable(),
  targetFps: z.coerce.number().int().min(15).max(500).nullable().optional(),
  hardwareTier: HardwareTier,
  isDefault: z.boolean().default(false),
  version: Semver.default('1.0.0'),
});
export type ProfileCreateInput = z.infer<typeof ProfileCreateInput>;

export const ProfileUpdateInput = ProfileCreateInput.partial();
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateInput>;

export const SettingCreateInput = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/, 'Key must be lowercase snake/kebab/dotted'),
  name: z.string().trim().min(1).max(200),
  type: SettingType,
  value: z.string().trim().max(500).default(''),
  description: z.string().trim().max(1_000).optional().nullable(),
  categorySlug: z.string().trim().min(1).max(100).optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});
export type SettingCreateInput = z.infer<typeof SettingCreateInput>;

export const SettingUpdateInput = SettingCreateInput.partial();
export type SettingUpdateInput = z.infer<typeof SettingUpdateInput>;

export const OptionCreateInput = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
  isRecommended: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});
export type OptionCreateInput = z.infer<typeof OptionCreateInput>;

export const OptionUpdateInput = OptionCreateInput.partial();
export type OptionUpdateInput = z.infer<typeof OptionUpdateInput>;

/** Publish / version-bump payloads. */
export const VersionCreateInput = z.object({
  version: Semver.optional(),
  changeNote: z.string().trim().max(2_000).optional().nullable(),
});
export type VersionCreateInput = z.infer<typeof VersionCreateInput>;

export const PublishInput = z.object({
  status: z.enum(['published', 'draft', 'archived']),
});
export type PublishInput = z.infer<typeof PublishInput>;

/** Version history entry. */
export const ProfileVersion = z.object({
  id: z.string().uuid(),
  version: Semver,
  changeNote: z.string().nullable(),
  createdAt: IsoDate,
  createdBy: z
    .object({
      id: z.string().uuid(),
      email: z.string(),
    })
    .nullable(),
});
export type ProfileVersion = z.infer<typeof ProfileVersion>;
