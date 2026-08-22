import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { MfgTool, MfgToolPackageResponse, MfgToolStatusResponse } from '@goh/validation';
import { authenticateUser } from '../lib/auth-middleware';
import { notFound } from '../lib/errors';
import { requireFeature } from '../lib/feature-gate';
import { storage } from '../lib/storage';
import { config } from '../config';
import { findPublishedToolPackage, listPackageFiles, toPackagePublic } from '../services/packages';

/**
 * The two Multi-Frame Generation tools — OptiFlow and OptiScaler.
 *
 * These sit beside the per-game package routes rather than replacing them:
 * an OptiFlow payload is the same bytes for every game (the Streamline
 * components and the launcher-side unlocker), so it is published once as a
 * global package and looked up by kind instead of by game.
 *
 * Access is split deliberately across two endpoints. `/status` is public
 * because "no package published yet" is not a subscription answer — showing a
 * paywall for an empty admin panel would be a lie. `/package` carries the
 * bytes and is gated exactly like every other download.
 */
export async function mfgToolsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/mfg/tools/:tool',
    {
      schema: { params: z.object({ tool: MfgTool }), response: { 200: MfgToolStatusResponse } },
    },
    async (request) => {
      const { tool } = request.params;
      const pkg = await findPublishedToolPackage(tool);
      if (!pkg) return { tool, available: false, package: null, manifest: [] };

      const files = await listPackageFiles(pkg.id);
      return {
        tool,
        // A published package with an empty manifest installs nothing, so it
        // is not available in any sense the page cares about.
        available: files.length > 0,
        package: toPackagePublic(pkg),
        manifest: files.map((f) => ({
          filename: f.filename,
          sha256: f.sha256,
          size: f.size,
          destination: f.destination,
          operation: f.operation,
          role: f.role,
          sortOrder: f.sortOrder,
        })),
      };
    },
  );

  // Entitlement-gated: returns the manifest with short-lived signed URLs. The
  // desktop never decides whether the user may install — this does.
  typed.post(
    '/mfg/tools/:tool/download',
    {
      preHandler: [authenticateUser, requireFeature('multi_frame_generation')],
      schema: { params: z.object({ tool: MfgTool }), response: { 200: MfgToolPackageResponse } },
    },
    async (request) => {
      const { tool } = request.params;
      const pkg = await findPublishedToolPackage(tool);
      if (!pkg) throw notFound(tool === 'optiflow' ? 'OptiFlow package' : 'OptiScaler package');

      const files = await listPackageFiles(pkg.id);
      if (files.length === 0) throw notFound('Package manifest');

      const signed = await Promise.all(files.map((f) => storage.signDownload(f.storageKey, config.DOWNLOAD_URL_TTL)));
      return {
        tool,
        package: toPackagePublic(pkg),
        files: files.map((f, i) => ({
          filename: f.filename,
          sha256: f.sha256,
          size: f.size,
          destination: f.destination,
          operation: f.operation,
          role: f.role,
          url: signed[i]!,
          expiresIn: config.DOWNLOAD_URL_TTL,
        })),
      };
    },
  );
}
