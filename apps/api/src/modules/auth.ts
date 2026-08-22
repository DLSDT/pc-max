import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AdminLoginInput, AdminMe, AuthResponse } from '@goh/validation';
import { config } from '../config';
import { clearRefreshCookieOptions, refreshCookieOptions } from '../lib/refresh-cookie';
import { db } from '../db';
import { admins, sessions } from '../db/schema';
import { AppError, unauthorized } from '../lib/errors';
import { verifyPasswordOrDecoy } from '../lib/password';
import { signAccessToken } from '../lib/jwt';
import { permissionsFor } from '../lib/rbac';
import { authenticate } from '../lib/auth-middleware';

const REFRESH_COOKIE = 'goh_refresh';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

function refreshTokenTtlMs() {
  return config.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function setRefreshCookie(reply: import('fastify').FastifyReply, token: string) {
  void reply.setCookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(reply: import('fastify').FastifyReply) {
  // Same attributes as when it was set, or the browser keeps the old cookie.
  void reply.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
}

async function createSession(adminId: string, ip: string, userAgent: string | undefined) {
  const token = randomBytes(48).toString('hex');
  await db.insert(sessions).values({
    adminId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + refreshTokenTtlMs()),
    ip,
    userAgent,
  });
  return token;
}

async function loadAdminById(id: string) {
  return db.query.admins.findFirst({ where: and(eq(admins.id, id), eq(admins.isActive, true)) });
}

export async function authModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/admin/auth/login',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        body: AdminLoginInput,
        response: { 200: AuthResponse },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const admin = await db.query.admins.findFirst({
        where: and(eq(admins.email, email), eq(admins.isActive, true)),
      });

      // Always run a verify to reduce user-enumeration timing differences.
      const ok = await verifyPasswordOrDecoy(password, admin?.passwordHash);
      if (!admin || !ok) throw unauthorized('Invalid email or password');

      await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));

      const refreshToken = await createSession(admin.id, request.ip, request.headers['user-agent']);
      setRefreshCookie(reply, refreshToken);

      return {
        accessToken: signAccessToken(admin.id, admin.role),
        expiresIn: 15 * 60,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          permissions: permissionsFor(admin.role),
        },
      };
    },
  );

  typed.post('/admin/auth/refresh', async (request, reply) => {
    const incoming = request.cookies[REFRESH_COOKIE];
    if (!incoming) throw unauthorized('No refresh token');

    const row = await db.query.sessions.findFirst({
      where: and(eq(sessions.tokenHash, sha256(incoming)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
    });
    if (!row) throw unauthorized('Invalid or expired refresh token');

    const admin = await loadAdminById(row.adminId);
    if (!admin) throw unauthorized('Account is no longer active');

    // Rotate: revoke the old session, create a new one.
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, row.id));
    const refreshToken = await createSession(admin.id, request.ip, request.headers['user-agent']);
    setRefreshCookie(reply, refreshToken);

    return {
      accessToken: signAccessToken(admin.id, admin.role),
      expiresIn: 15 * 60,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: permissionsFor(admin.role),
      },
    };
  });

  typed.post('/admin/auth/logout', async (request, reply) => {
    const incoming = request.cookies[REFRESH_COOKIE];
    if (incoming) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.tokenHash, sha256(incoming)));
    }
    clearRefreshCookie(reply);
    return { ok: true };
  });

  typed.get(
    '/admin/auth/me',
    {
      preHandler: [authenticate],
      schema: { response: { 200: AdminMe } },
    },
    async (request) => {
      const admin = await loadAdminById(request.admin!.id);
      if (!admin) throw new AppError(401, 'UNAUTHORIZED', 'Account is no longer active');
      return {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: permissionsFor(admin.role),
        lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.toISOString() : null,
      };
    },
  );
}
