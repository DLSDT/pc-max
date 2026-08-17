import { z } from 'zod';
import { GameStatus, HardwareTier, ImageType, IsoDate, RequirementTier, TechFlag } from './enums';

/** Technologies a game supports (DLSS / FSR / XeSS / RT / FG / vendor). */
export const Technologies = z.object({
  dlss: z.boolean(),
  fsr: z.boolean(),
  xess: z.boolean(),
  ray_tracing: z.boolean(),
  frame_generation: z.boolean(),
  nvidia: z.boolean(),
  amd: z.boolean(),
  intel: z.boolean(),
});
export type Technologies = z.infer<typeof Technologies>;

export const TechnologiesInput = Technologies.partial().default({});
export type TechnologiesInput = z.infer<typeof TechnologiesInput>;

/** An image attached to a game (cover, background, logo, screenshot). */
export const GameImage = z.object({
  id: z.string().uuid(),
  type: ImageType,
  url: z.string().url(),
  objectKey: z.string().nullable(),
  altText: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type GameImage = z.infer<typeof GameImage>;

/** Hardware requirements for one tier (minimum / recommended). */
export const GameRequirement = z.object({
  tier: RequirementTier,
  os: z.string(),
  cpu: z.string(),
  gpu: z.string(),
  ramGb: z.number(),
  storageGb: z.number(),
  directx: z.string().nullish(),
  notes: z.string().nullish(),
});
export type GameRequirement = z.infer<typeof GameRequirement>;

export const GameRequirementInput = GameRequirement.omit({ tier: true });
export type GameRequirementInput = z.infer<typeof GameRequirementInput>;

export const GameRequirementsInput = z.object({
  minimum: GameRequirementInput.optional(),
  recommended: GameRequirementInput.optional(),
});
export type GameRequirementsInput = z.infer<typeof GameRequirementsInput>;

/** Compact category reference used on game cards. */
export const CategoryRef = z.object({
  slug: z.string(),
  name: z.string(),
});
export type CategoryRef = z.infer<typeof CategoryRef>;

/** The "default" optimization profile shown on a game card. */
export const DefaultProfileRef = z
  .object({
    slug: z.string(),
    name: z.string(),
    version: z.string(),
    targetFps: z.number().int().nullable(),
    hardwareTier: HardwareTier.nullable(),
  })
  .nullable();
export type DefaultProfileRef = z.infer<typeof DefaultProfileRef>;

/** Game summary — exactly what a game card needs. */
export const GameSummary = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string().nullable(),
  genres: z.array(CategoryRef),
  releaseYear: z.number().int().nullable(),
  engine: z.string().nullable(),
  api: z.string().nullable(),
  technologies: Technologies,
  performanceRating: z.number().int().min(0).max(100),
  coverUrl: z.string().nullable(),
  status: GameStatus,
  featured: z.boolean(),
  defaultProfile: DefaultProfileRef,
  /** Executable file names used for generic game detection (e.g. ["GTA5.exe"]). */
  executables: z.array(z.string()).default([]),
  launcher: z.string().nullable(),
});
export type GameSummary = z.infer<typeof GameSummary>;

/** Full game detail. */
export const GameDetail = GameSummary.extend({
  description: z.string().nullable(),
  developer: z.string().nullable(),
  publisher: z.string().nullable(),
  releaseDate: z.string().nullable(),
  executables: z.array(z.string()).default([]),
  steamAppId: z.string().nullable(),
  epicAppId: z.string().nullable(),
  launcher: z.string().nullable(),
  images: z.array(GameImage),
  requirements: z.array(GameRequirement),
  tags: z.array(z.object({ slug: z.string(), name: z.string() })),
  viewCount: z.number().int(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type GameDetail = z.infer<typeof GameDetail>;

export const GameListMeta = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
});
export type GameListMeta = z.infer<typeof GameListMeta>;

export const GameListResponse = z.object({
  data: z.array(GameSummary),
  meta: GameListMeta,
});
export type GameListResponse = z.infer<typeof GameListResponse>;

/**
 * Public list query params.
 *
 * `techs` accepts either repeated params (`?techs=dlss&techs=fsr`) or a
 * comma-separated list (`?techs=dlss,fsr`) — the querystring parser returns a
 * single string for one value, so we normalize here.
 */
const techsList = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
    return v;
  },
  z.array(TechFlag).max(8).optional(),
);

export const GamesQuery = z.object({
  q: z.string().trim().max(100).optional(),
  genre: z.string().trim().max(100).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  techs: techsList,
  sort: z.enum(['popular', 'new', 'rating', 'name']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type GamesQuery = z.infer<typeof GamesQuery>;

/** Admin create / update payloads. */
export const GameCreateInput = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case'),
  tagline: z.string().trim().max(300).optional().nullable(),
  description: z.string().trim().max(20_000).optional().nullable(),
  developer: z.string().trim().max(200).optional().nullable(),
  publisher: z.string().trim().max(200).optional().nullable(),
  releaseDate: z.string().trim().optional().nullable(),
  engine: z.string().trim().max(100).optional().nullable(),
  api: z.string().trim().max(100).optional().nullable(),
  technologies: TechnologiesInput,
  performanceRating: z.coerce.number().int().min(0).max(100).default(50),
  /** Executable file names used for generic game detection (e.g. ["GTA5.exe"]). */
  executables: z.array(z.string().trim().min(1).max(200)).max(50).optional().default([]),
  steamAppId: z.string().trim().max(64).optional().nullable(),
  epicAppId: z.string().trim().max(64).optional().nullable(),
  launcher: z.enum(['steam', 'epic', 'gog', 'standalone']).optional().nullable(),
  featured: z.boolean().default(false),
  status: GameStatus.default('draft'),
  genreSlugs: z.array(z.string().trim().min(1).max(100)).max(20).optional().default([]),
  tagSlugs: z.array(z.string().trim().min(1).max(100)).max(20).optional().default([]),
});
export type GameCreateInput = z.infer<typeof GameCreateInput>;

export const GameUpdateInput = GameCreateInput.partial();
export type GameUpdateInput = z.infer<typeof GameUpdateInput>;

/** Reference an already-uploaded object when attaching an image to a game. */
export const GameImageInput = z.object({
  type: ImageType,
  objectKey: z.string().trim().min(1).max(500),
  altText: z.string().trim().max(300).optional().nullable(),
});
export type GameImageInput = z.infer<typeof GameImageInput>;

export const PresignUploadInput = z.object({
  kind: ImageType,
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().min(1).max(10 * 1024 * 1024),
});
export type PresignUploadInput = z.infer<typeof PresignUploadInput>;

export const PresignUploadResponse = z.object({
  uploadUrl: z.string(),
  objectKey: z.string(),
  publicUrl: z.string(),
});
export type PresignUploadResponse = z.infer<typeof PresignUploadResponse>;
