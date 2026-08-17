import { z } from 'zod';
import { GameSummary } from './game';

export const AdminGameRow = GameSummary.extend({
  developer: z.string().nullable(),
  publisher: z.string().nullable(),
  releaseDate: z.string().nullable(),
  viewCount: z.number().int(),
  profileCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminGameRow = z.infer<typeof AdminGameRow>;

export const AdminGameListResponse = z.object({
  data: z.array(AdminGameRow),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
  }),
});
export type AdminGameListResponse = z.infer<typeof AdminGameListResponse>;

export const DashboardStats = z.object({
  totalUsers: z.number().int(),
  activeUsers7d: z.number().int(),
  totalGames: z.number().int(),
  publishedGames: z.number().int(),
  totalProfiles: z.number().int(),
  totalViews: z.number().int(),
  appVersions: z.number().int(),
});
export type DashboardStats = z.infer<typeof DashboardStats>;

export const TopGameRow = z.object({
  gameId: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  coverUrl: z.string().nullable(),
  views: z.number().int(),
});
export type TopGameRow = z.infer<typeof TopGameRow>;

export const DailyViewsRow = z.object({
  date: z.string(),
  views: z.number().int(),
});
export type DailyViewsRow = z.infer<typeof DailyViewsRow>;

export const DashboardResponse = z.object({
  stats: DashboardStats,
  topGames: z.array(TopGameRow),
  dailyViews: z.array(DailyViewsRow),
  recentGames: z.array(GameSummary),
  recentUpdates: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      updatedAt: z.string(),
    }),
  ),
});
export type DashboardResponse = z.infer<typeof DashboardResponse>;

export const AuditLogRow = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
  admin: z
    .object({
      id: z.string().uuid(),
      email: z.string(),
      name: z.string(),
    })
    .nullable(),
});
export type AuditLogRow = z.infer<typeof AuditLogRow>;

export const AuditLogListResponse = z.object({
  data: z.array(AuditLogRow),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
  }),
});
export type AuditLogListResponse = z.infer<typeof AuditLogListResponse>;
