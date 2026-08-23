import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { MfgTool, MfgToolPackageResponse, MfgToolStatusResponse } from '@goh/validation';
import { authenticateUser } from '../lib/auth-middleware';
import { badRequest, notFound } from '../lib/errors';
import { requireFeature } from '../lib/feature-gate';
import { storage } from '../lib/storage';
import { config } from '../config';
import {
  baseFiles,
  findPublishedToolPackage,
  listPackageFiles,
  packageChoices,
  packageVariants,
  resolveInstallFiles,
  toPackagePublic,
} from '../services/packages';

/**
 * The Multi-Frame Generation tools — OptiScaler, AI Optical Flow and
 * Streamline PC Max.
 *
 * Each is one global package (the same bytes for every game), looked up by
 * kind rather than by game. A package carries three classes of content at
 * once: the installer drop-in, the selectable Plans, and the selectable
 * Orders. One install combines base content + one installer + one Plan + one
 * Order, and the server resolves that combination so the client never has to
 * work out which files a choice implies.
 *
 * `/status` is public because "nothing published yet" is not a subscription
 * answer — showing a paywall over an empty admin panel would be a lie.
 * `/download` carries the bytes and is gated like every other download.
 */
export async function mfgToolsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/mfg/tools/:tool',
    { schema: { params: z.object({ tool: MfgTool }), response: { 200: MfgToolStatusResponse } } },
    async (request) => {
      const { tool } = request.params;
      const pkg = await findPublishedToolPackage(tool);
      const empty = {
        tool,
        available: false,
        package: null,
        manifest: [],
        variants: [],
        installers: [],
        plans: [],
        orders: [],
        baseFileCount: 0,
      };
      if (!pkg) return empty;

      const files = await listPackageFiles(pkg.id);
      if (files.length === 0) return { ...empty, package: toPackagePublic(pkg) };

      return {
        tool,
        available: true,
        package: toPackagePublic(pkg),
        manifest: files.map((f) => ({
          filename: f.filename,
          sha256: f.sha256,
          size: f.size,
          destination: f.destination,
          operation: f.operation,
          role: f.role,
          variant: f.variant,
          component: f.component,
          sortOrder: f.sortOrder,
        })),
        variants: packageVariants(files),
        installers: packageChoices(files, 'installer'),
        plans: packageChoices(files, 'plan'),
        orders: packageChoices(files, 'order'),
        baseFileCount: baseFiles(files).length,
      };
    },
  );

  // Entitlement-gated: the manifest with short-lived signed URLs. The desktop
  // never decides whether the user may install — this does.
  typed.post(
    '/mfg/tools/:tool/download',
    {
      preHandler: [authenticateUser, requireFeature('multi_frame_generation')],
      schema: {
        params: z.object({ tool: MfgTool }),
        querystring: z.object({
          // `variant` is the older single-choice form still used by AI Optical
          // Flow; installer/plan/order is the three-axis form OptiScaler needs.
          variant: z.string().trim().min(1).max(60).optional(),
          installer: z.string().trim().min(1).max(60).optional(),
          plan: z.string().trim().min(1).max(60).optional(),
          order: z.string().trim().min(1).max(60).optional(),
        }),
        response: { 200: MfgToolPackageResponse },
      },
    },
    async (request) => {
      const { tool } = request.params;
      const pkg = await findPublishedToolPackage(tool);
      if (!pkg) throw notFound(`${tool} package`);

      const all = await listPackageFiles(pkg.id);
      if (all.length === 0) throw notFound('Package manifest');

      const installers = packageChoices(all, 'installer');
      const plans = packageChoices(all, 'plan');
      const orders = packageChoices(all, 'order');
      const q = request.query;

      // Naming something that was never published would otherwise resolve to a
      // partial file set and install "successfully" without what was chosen.
      const check = (label: string, value: string | undefined, available: { name: string }[]) => {
        if (value === undefined) return;
        if (!available.some((c) => c.name === value)) {
          throw badRequest(
            available.length === 0
              ? `No ${label} has been published for this tool`
              : `Unknown ${label} "${value}". Available: ${available.map((c) => c.name).join(', ')}`,
          );
        }
      };
      check('installer', q.installer, installers);
      check('plan', q.plan, plans);
      check('order', q.order, orders);

      let files;
      if (q.installer !== undefined || q.plan !== undefined || q.order !== undefined) {
        // Three-axis selection. Every group that HAS choices must be chosen
        // from — a missing Plan means the user gets the drop-in with no
        // configuration and no indication anything is wrong.
        const missing: string[] = [];
        if (installers.length > 0 && q.installer === undefined) missing.push('installer');
        if (plans.length > 0 && q.plan === undefined) missing.push('plan');
        if (orders.length > 0 && q.order === undefined) missing.push('order');
        if (missing.length) throw badRequest(`This package requires a ${missing.join(' and a ')}`);
        files = resolveInstallFiles(all, { installer: q.installer, plan: q.plan, order: q.order });
      } else {
        // Single-choice form.
        const variants = packageVariants(all);
        if (q.variant !== undefined && !variants.includes(q.variant)) throw badRequest(`Unknown profile "${q.variant}"`);
        if (q.variant === undefined && variants.length > 0) {
          throw badRequest(`This package requires a profile. Choose one of: ${variants.join(', ')}`);
        }
        files = all.filter((f) => f.variant === null || f.variant === q.variant);
      }

      if (files.length === 0) throw badRequest('That combination resolves to no files');

      // Two files racing for one path is a packaging mistake, not a user error.
      // The native installer refuses it outright, so catching it here names the
      // conflict instead of failing halfway through a download.
      const seen = new Map<string, string>();
      for (const f of files) {
        const owner = `${f.component}${f.variant ? ` "${f.variant}"` : ' (shared)'}`;
        const prev = seen.get(f.destination);
        if (prev) throw badRequest(`${prev} and ${owner} both install "${f.destination}" — the package needs fixing`);
        seen.set(f.destination, owner);
      }

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
          variant: f.variant,
          component: f.component,
          url: signed[i]!,
          expiresIn: config.DOWNLOAD_URL_TTL,
        })),
      };
    },
  );
}
