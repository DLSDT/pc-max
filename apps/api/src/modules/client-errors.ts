import { createHash } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db';
import { clientErrors } from '../db/schema';
import { requirePermission } from '../lib/auth-middleware';

/**
 * Crash reporting for the desktop client.
 *
 * Anonymous and self-hosted — no third-party service. Reports are grouped by a
 * fingerprint (message + top stack frame + route) so one recurring crash is a
 * single row with an occurrence count rather than thousands of duplicates.
 *
 * Everything here is untrusted client input: fields are length-capped by the
 * schema, the endpoint has its own tight per-IP rate limit, and nothing is
 * ever echoed back to other clients.
 */

const ReportInput = z.object({
  message: z.string().trim().min(1).max(1000),
  stack: z.string().trim().max(8000).optional(),
  route: z.string().trim().max(300).optional(),
  appVersion: z.string().trim().max(50).optional(),
  platform: z.string().trim().max(80).optional(),
  deviceId: z.string().trim().max(100).optional(),
  source: z.enum(['render', 'window', 'promise']).default('render'),
});

const okSchema = z.object({ ok: z.literal(true) });

/** Stable group key: the message + first stack frame + route. */
function fingerprintOf(input: z.infer<typeof ReportInput>): string {
  const firstFrame = (input.stack ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('at ')) ?? '';
  return createHash('sha256').update(`${input.message}|${firstFrame}|${input.route ?? ''}`).digest('hex').slice(0, 32);
}

export async function clientErrorsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- public: the desktop app reports its own crashes -------------------
  typed.post(
    '/client-errors',
    {
      // Deliberately tighter than the global bound: a crash-looping client
      // must not be able to flood the table or the API.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { body: ReportInput, response: { 200: okSchema } },
    },
    async (request) => {
      const input = request.body;
      const fingerprint = fingerprintOf(input);

      // Upsert: first report inserts, repeats just bump the counter + lastSeen.
      await db
        .insert(clientErrors)
        .values({
          fingerprint,
          message: input.message,
          stack: input.stack ?? null,
          route: input.route ?? null,
          appVersion: input.appVersion ?? null,
          platform: input.platform ?? null,
          deviceId: input.deviceId ?? null,
          source: input.source,
        })
        .onConflictDoUpdate({
          target: clientErrors.fingerprint,
          set: {
            occurrences: sql`${clientErrors.occurrences} + 1`,
            lastSeenAt: new Date(),
            // A previously-resolved crash that came back is not resolved.
            resolved: false,
            appVersion: input.appVersion ?? null,
          },
        });

      return { ok: true as const };
    },
  );

  // ---- admin: read + triage ---------------------------------------------
  const ErrorRow = z.object({
    id: z.string(),
    fingerprint: z.string(),
    message: z.string(),
    stack: z.string().nullable(),
    route: z.string().nullable(),
    appVersion: z.string().nullable(),
    platform: z.string().nullable(),
    source: z.string(),
    occurrences: z.number(),
    resolved: z.boolean(),
    firstSeenAt: z.string(),
    lastSeenAt: z.string(),
  });

  typed.get(
    '/admin/client-errors',
    {
      preHandler: [requirePermission('audit.read')],
      schema: {
        querystring: z.object({
          resolved: z.enum(['true', 'false']).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(100),
        }),
        response: { 200: z.object({ data: z.array(ErrorRow) }) },
      },
    },
    async (request) => {
      const { resolved, limit } = request.query;
      const rows = await db
        .select()
        .from(clientErrors)
        .where(resolved === undefined ? undefined : eq(clientErrors.resolved, resolved === 'true'))
        .orderBy(desc(clientErrors.lastSeenAt))
        .limit(limit);

      return {
        data: rows.map((r) => ({
          id: r.id,
          fingerprint: r.fingerprint,
          message: r.message,
          stack: r.stack,
          route: r.route,
          appVersion: r.appVersion,
          platform: r.platform,
          source: r.source,
          occurrences: r.occurrences,
          resolved: r.resolved,
          firstSeenAt: r.firstSeenAt.toISOString(),
          lastSeenAt: r.lastSeenAt.toISOString(),
        })),
      };
    },
  );

  typed.patch(
    '/admin/client-errors/:id',
    {
      preHandler: [requirePermission('audit.read')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ resolved: z.boolean() }),
        response: { 200: okSchema },
      },
    },
    async (request) => {
      await db
        .update(clientErrors)
        .set({ resolved: request.body.resolved })
        .where(eq(clientErrors.id, request.params.id));
      return { ok: true as const };
    },
  );

  typed.delete(
    '/admin/client-errors/:id',
    {
      preHandler: [requirePermission('audit.read')],
      schema: { params: z.object({ id: z.string().uuid() }), response: { 200: okSchema } },
    },
    async (request) => {
      await db.delete(clientErrors).where(eq(clientErrors.id, request.params.id));
      return { ok: true as const };
    },
  );
}
