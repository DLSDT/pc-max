import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
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

  typed.post(
    '/admin/email/test',
    {
      preHandler: [requirePermission('settings.write')],
      schema: { response: { 200: z.object({ ok: z.boolean() }) } },
    },
    async (request) => {
      const admin = request.admin!;
      const res = await deliverEmail(
        admin.email,
        'PC MAX — email test',
        renderAdminTestEmail(admin.email),
        'admin_test',
        mail,
      );
      if (!res.ok) {
        throw new AppError(502, 'EMAIL_DELIVERY_FAILED', 'Email delivery failed — check the server logs');
      }
      await recordAudit(request, { action: 'email.test_sent', entityType: 'email', entityId: admin.id, after: { to: admin.email } });
      return { ok: true };
    },
  );
}
