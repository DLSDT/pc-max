import { z } from 'zod';

/**
 * Shared enums used across the entire API contract.
 */

export const GameStatus = z.enum(['draft', 'published', 'archived']);
export type GameStatus = z.infer<typeof GameStatus>;

export const HardwareTier = z.enum(['low_end', 'mid_range', 'high_end', 'ultra']);
export type HardwareTier = z.infer<typeof HardwareTier>;

export const ImageType = z.enum(['cover', 'background', 'logo', 'screenshot']);
export type ImageType = z.infer<typeof ImageType>;

export const RequirementTier = z.enum(['minimum', 'recommended']);
export type RequirementTier = z.infer<typeof RequirementTier>;

export const SettingType = z.enum(['select', 'boolean', 'slider', 'text']);
export type SettingType = z.infer<typeof SettingType>;

export const ProfileStatus = z.enum(['draft', 'published', 'archived']);
export type ProfileStatus = z.infer<typeof ProfileStatus>;

export const AdminRole = z.enum(['super_admin', 'admin', 'editor', 'viewer']);
export type AdminRole = z.infer<typeof AdminRole>;

export const AppChannel = z.enum(['stable', 'beta']);
export type AppChannel = z.infer<typeof AppChannel>;

export const TechFlag = z.enum(['dlss', 'fsr', 'xess', 'ray_tracing', 'frame_generation', 'nvidia', 'amd', 'intel']);
export type TechFlag = z.infer<typeof TechFlag>;

/** Version string in semver format: 1.2.3 */
export const Semver = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Expected semantic version like 1.4.2');

/** ISO-8601 datetime string. */
export const IsoDate = z.string().datetime({ offset: true });
