import { asc, eq, inArray, isNull, and } from 'drizzle-orm';
import { db } from '../db';
import { optimizationCategories, optimizationOptions, optimizationProfiles, optimizationSettings } from '../db/schema';
import { iso } from './games';
import type { OptimizationProfile, OptimizationSetting } from '@goh/validation';

export type ProfileRow = typeof optimizationProfiles.$inferSelect;

/**
 * Attach settings (grouped categories + options) to profile rows.
 * Settings are ordered by (category sortOrder, setting sortOrder).
 */
export async function attachSettings(rows: ProfileRow[]): Promise<OptimizationProfile[]> {
  if (rows.length === 0) return [];
  const profileIds = rows.map((r) => r.id);

  const settings = await db
    .select()
    .from(optimizationSettings)
    .where(inArray(optimizationSettings.profileId, profileIds))
    .orderBy(asc(optimizationSettings.sortOrder));

  const settingsByProfile = new Map<string, typeof settings>();
  for (const s of settings) {
    const list = settingsByProfile.get(s.profileId) ?? [];
    list.push(s);
    settingsByProfile.set(s.profileId, list);
  }

  const categoryIds = [...new Set(settings.map((s) => s.categoryId).filter((c): c is string => Boolean(c)))];
  const cats = categoryIds.length
    ? await db
        .select()
        .from(optimizationCategories)
        .where(inArray(optimizationCategories.id, categoryIds))
    : [];
  const catById = new Map(cats.map((c) => [c.id, c]));

  const settingIds = settings.map((s) => s.id);
  const options = settingIds.length
    ? await db
        .select()
        .from(optimizationOptions)
        .where(inArray(optimizationOptions.settingId, settingIds))
        .orderBy(asc(optimizationOptions.sortOrder))
    : [];
  const optionsBySetting = new Map<string, typeof options>();
  for (const o of options) {
    const list = optionsBySetting.get(o.settingId) ?? [];
    list.push(o);
    optionsBySetting.set(o.settingId, list);
  }

  return rows.map((p) => {
    const s = settingsByProfile.get(p.id) ?? [];
    const settingsOut: OptimizationSetting[] = s.map((setting) => {
      const cat = setting.categoryId ? catById.get(setting.categoryId) : undefined;
      return {
        id: setting.id,
        key: setting.key,
        name: setting.name,
        type: setting.type,
        value: setting.value,
        description: setting.description,
        category: cat ? { slug: cat.slug, name: cat.name } : null,
        sortOrder: setting.sortOrder,
        options: (optionsBySetting.get(setting.id) ?? []).map((o) => ({
          id: o.id,
          value: o.value,
          label: o.label,
          isRecommended: o.isRecommended,
          sortOrder: o.sortOrder,
        })),
      };
    });
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      targetFps: p.targetFps,
      hardwareTier: p.hardwareTier,
      version: p.version,
      status: p.status,
      isDefault: p.isDefault,
      viewCount: p.viewCount,
      publishedAt: iso(p.publishedAt),
      updatedAt: iso(p.updatedAt)!,
      settings: settingsOut,
    };
  });
}

export async function findPublishedProfile(profileIdOrSlug: string, gameId: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileIdOrSlug);
  const row = await db.query.optimizationProfiles.findFirst({
    where: and(
      eq(optimizationProfiles.gameId, gameId),
      isNull(optimizationProfiles.deletedAt),
      eq(optimizationProfiles.status, 'published'),
      isUuid ? eq(optimizationProfiles.id, profileIdOrSlug) : eq(optimizationProfiles.slug, profileIdOrSlug),
    ),
  });
  return row;
}

/** Snapshot of a profile's full setting tree (for version history). */
export async function snapshotProfileData(profileId: string): Promise<unknown> {
  const [profile] = await attachSettings(
    await db
      .select()
      .from(optimizationProfiles)
      .where(and(eq(optimizationProfiles.id, profileId), isNull(optimizationProfiles.deletedAt))),
  );
  if (!profile) return null;
  return profile.settings;
}
