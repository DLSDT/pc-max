import { z } from 'zod';

export const idParams = z.object({ id: z.string().uuid() });
export type IdParams = z.infer<typeof idParams>;

export const slugParams = z.object({ slug: z.string().min(1).max(200) });
export type SlugParams = z.infer<typeof slugParams>;

export const gameIdParams = z.object({ gameId: z.string().uuid() });
export type GameIdParams = z.infer<typeof gameIdParams>;

export const idImageParams = z.object({ id: z.string().uuid(), imageId: z.string().uuid() });

export const slugProfileParams = z.object({ slug: z.string().min(1).max(200), profileSlug: z.string().min(1).max(200) });
