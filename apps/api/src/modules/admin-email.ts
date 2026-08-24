import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { emailLogs } from '../db/schema';
import { config } from '../config';
import { AppError } from '../lib/errors';
import { requirePermission } from '../lib/auth-middleware';
import { recordAudit } from '../lib/audit';
import { createMailProvider, deliverEmail, renderAdminTestEmail } from '../lib/email';

const mail = createMailProvider();

/**
 * Admin email configuration status + a safe "test email" action.
 *
 * Secrets (SMTP_USER / SMTP_PASSWORD / API keys) are NEVER returned by the API
 * or stored anywhere except the environment — this module only reports whether
 * the provider is configured.
 */
export async function adminEmailModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/admin/email/status',
    { preHandler: [requirePermission('settings.read')] },
    async () => ({
      provider: config.EMAIL_PROVIDER,
      from: config.EMAIL_FROM,
      fromName: config.EMAIL_FROM_NAME,
      // No credentials are ever exposed — just whether the stack is ready.
      configured: config.EMAIL_PROVIDER === 'smtp' && Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD),
      development: config.NODE_ENV !== 'production',
    }),
  );

  typed.get(
    '/admin/email/logs',
    {
      preHandler: [requirePermission('settings.read')],
      schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }) },
    },
    async (request) => {
      // Delivery outcomes have been recorded since this module was written but
      // never surfaced, so "I never got the code" had no answer an admin could
      // look up. Only the masked recipient is returned; the full address is
      // never stored in the first place.
      const rows = await db
        .select({
          id: emailLogs.id,
          event: emailLogs.event,
          recipient: emailLogs.maskedRecipient,
          provider: emailLogs.provider,
          status: emailLogs.status,
          providerMessage: emailLogs.providerMessage,
          createdAt: emailLogs.createdAt,
        })
        .from(emailLogs)
        .orderBy(desc(emailLogs.createdAt))
        .limit(request.query.limit);
      return { data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
    },
  );

  typed.post(
    '/admin/email/test',
    {
      preHandler: [requirePermission('settings.write')],
      schema: {
        // Optional recipient: testing only to the admin's own address proves
        // SMTP accepted the message, not that mail reaches a mailbox anyone can
        // open — the bootstrap admin address often has none.
        body: z.object({ to: z.string().trim().email().max(320).optional() }).optional(),
        response: { 200: z.object({ ok: z.boolean(), to: z.string() }) },
      },
    },
    async (request) => {
      const admin = request.admin!;
      const to = request.body?.to ?? admin.email;
      const res = await deliverEmail(to, 'PC MAX — email test', renderAdminTestEmail(to), 'admin_test', mail);
      if (!res.ok) {
        throw new AppError(502, 'EMAIL_DELIVERY_FAILED', 'Email delivery failed — check the server logs');
      }
      await recordAudit(request, { action: 'email.test_sent', entityType: 'email', entityId: admin.id, after: { to } });
      return { ok: true, to };
    },
  );
}
