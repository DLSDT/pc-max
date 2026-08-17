import { z } from 'zod';
import { IsoDate } from './enums';

export const Category = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  gameCount: z.number().int().default(0),
});
export type Category = z.infer<typeof Category>;

export const CategoryListResponse = z.object({
  data: z.array(Category),
});
export type CategoryListResponse = z.infer<typeof CategoryListResponse>;

export const CategoryCreateInput = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case'),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1_000).optional().nullable(),
});
export type CategoryCreateInput = z.infer<typeof CategoryCreateInput>;

export const CategoryUpdateInput = CategoryCreateInput.partial();
export type CategoryUpdateInput = z.infer<typeof CategoryUpdateInput>;

export const Tag = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
});
export type Tag = z.infer<typeof Tag>;

export const TagListResponse = z.object({
  data: z.array(Tag),
});
export type TagListResponse = z.infer<typeof TagListResponse>;

export const TagCreateInput = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case'),
  name: z.string().trim().min(1).max(200),
});
export type TagCreateInput = z.infer<typeof TagCreateInput>;

export const TagUpdateInput = TagCreateInput.partial();
export type TagUpdateInput = z.infer<typeof TagUpdateInput>;

export const OptimizationCategory = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
});
export type OptimizationCategory = z.infer<typeof OptimizationCategory>;

export const OptimizationCategoryListResponse = z.object({
  data: z.array(OptimizationCategory),
});
export type OptimizationCategoryListResponse = z.infer<typeof OptimizationCategoryListResponse>;

export const OptimizationCategoryCreateInput = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case'),
  name: z.string().trim().min(1).max(200),
  sortOrder: z.coerce.number().int().default(0),
});
export type OptimizationCategoryCreateInput = z.infer<typeof OptimizationCategoryCreateInput>;

export const OptimizationCategoryUpdateInput = OptimizationCategoryCreateInput.partial();
export type OptimizationCategoryUpdateInput = z.infer<typeof OptimizationCategoryUpdateInput>;

/** Sync payloads — incremental content updates for the desktop app. */
export const SyncQuery = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  platform: z.enum(['windows']).default('windows'),
});
export type SyncQuery = z.infer<typeof SyncQuery>;

export const SyncResponse = z.object({
  contentUpdatedAt: IsoDate.nullable(),
  games: z.array(
    z.object({
      id: z.string().uuid(),
      slug: z.string(),
      updatedAt: IsoDate,
      deleted: z.boolean(),
    }),
  ),
  profiles: z.array(
    z.object({
      id: z.string().uuid(),
      gameId: z.string().uuid(),
      gameSlug: z.string(),
      slug: z.string(),
      version: z.string(),
      updatedAt: IsoDate,
      deleted: z.boolean(),
    }),
  ),
  categories: z.array(
    z.object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      updatedAt: IsoDate,
      deleted: z.boolean(),
    }),
  ),
});
export type SyncResponse = z.infer<typeof SyncResponse>;
