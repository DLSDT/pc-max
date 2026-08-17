import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db';
import { appConfig } from '../db/schema';
import { requirePermission } from '../lib/auth-middleware';
import { recordAudit } from '../lib/audit';
import { config } from '../config';
import { configCache } from '../lib/ttl-cache';

/**
 * Remote configuration (app_config table).
 *
 * Everything the desktop renders can be changed here without rebuilding the
 * app: announcements, maintenance mode, minimum supported version, and (in a
 * later phase) branding + theme.
 */
const SETTING_KEYS = ['announcement', 'maintenance_mode', 'min_app_version', 'branding'] as const;

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  announcement: { enabled: false, text: '' },
  maintenance_mode: { enabled: false, message: 'Server maintenance in progress.' },
  min_app_version: { version: '0.0.0' },
  // Phase 15 — remote branding/theme applied by clients without a rebuild.
  branding: {
    brand_name: 'PC MAX',
    primary_color: '#E50914',
    tagline: 'Premium PC Gaming Optimization',
    logo_url: null,
  },
};

export async function loadSettings(): Promise<Record<string, unknown>> {
  const rows = await db.select().from(appConfig);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function adminSettingsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/admin/settings',
    { preHandler: [requirePermission('settings.read')] },
    async () => ({ data: await loadSettings() }),
  );

  typed.put(
    '/admin/settings',
    {
      preHandler: [requirePermission('settings.write')],
      schema: {
        body: z.object({
          settings: z.record(z.string(), z.unknown()),
        }),
      },
    },
    async (request) => {
      const { settings } = request.body;
      for (const [key, value] of Object.entries(settings)) {
        if (!SETTING_KEYS.includes(key as (typeof SETTING_KEYS)[number])) continue;
        await db
          .insert(appConfig)
          .values({ key, value, updatedBy: request.admin!.id })
          .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedBy: request.admin!.id, updatedAt: new Date() } });
      }
      await recordAudit(request, { action: 'settings.update', entityType: 'app_config', entityId: 'settings', after: settings });
      await configCache.invalidate('settings');
      return { data: await loadSettings() };
    },
  );

  // Public: desktop app fetches this on every sync — remote config, no rebuild.
  // Served from the config cache (Phase 16); admin edits invalidate it.
  typed.get(
    '/config',
    { schema: { response: { 200: z.object({ data: z.record(z.string(), z.unknown()) }) } } },
    async (_request, reply) => {
      const payload = await configCache.get('settings', async () => ({ data: await loadSettings() }));
      void reply.header('cache-control', `public, max-age=${config.CONFIG_CACHE_TTL}`);
      return payload;
    },
  );
}
