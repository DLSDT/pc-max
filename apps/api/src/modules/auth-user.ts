import { createHash, randomBytes } from 'node:crypto';
import { and, count, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  OtpSendInput,
  OtpSendResponse,
  PasswordForgotInput,
  PasswordResetInput,
  PasswordResetResponse,
  RegisterInput,
  UserAuthResponse,
  UserLoginInput,
  UserPublic,
} from '@goh/validation';
import { config } from '../config';
import { db } from '../db';
import { loginAttempts, passwordResets, userSessions, users } from '../db/schema';
import { z } from 'zod';
import { AppError, badRequest, conflict, unauthorized } from '../lib/errors';
import { hashPassword, verifyPasswordOrDecoy } from '../lib/password';
import { signUserAccessToken } from '../lib/jwt';
import { authenticateUser } from '../lib/auth-middleware';
import {
  createMailProvider,
  deliverEmail,
  generateSecureToken,
  renderPasswordResetEmail,
  renderVerificationEmail,
} from '../lib/email';
import { isEmail, normalizeIdentifier } from '../lib/identifier';
import { issueOtp, verifyOtp, type OtpPurpose } from '../lib/otp';
import { createSmsProvider } from '../lib/sms';

const REFRESH_COOKIE = 'goh_user_refresh';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const ACCESS_TTL_SECONDS = 15 * 60;
const sms = createSmsProvider();
const mail = createMailProvider();

function refreshTokenTtlMs() {
  return config.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function setRefreshCookie(reply: import('fastify').FastifyReply, token: string) {
  void reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.NODE_ENV === 'production',
    path: '/',
    maxAge: config.REFRESH_TTL_DAYS * 24 * 60 * 60,
  });
}

function clearRefreshCookie(reply: import('fastify').FastifyReply) {
  void reply.clearCookie(REFRESH_COOKIE, { path: '/' });
}

async function createUserSession(userId: string, ip: string, userAgent: string | undefined) {
  const token = randomBytes(48).toString('hex');
  await db.insert(userSessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + refreshTokenTtlMs()),
    ip,
    userAgent,
  });
  return token;
}

function toUserPublic(user: typeof users.$inferSelect): (typeof UserPublic)['_type'] {
  return {
    id: user.id,
    phone: user.phone ?? null,
    phoneVerified: user.phoneVerified,
    email: user.email ?? null,
    emailVerified: user.emailVerified,
    username: user.username ?? null,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Match a user row by a normalized identifier (email OR phone). */
function userByIdentifier(identifier: string) {
  return isEmail(identifier) ? eq(users.email, identifier) : eq(users.phone, identifier);
}

/** Count failed attempts for an identifier (normalized phone) in the window. */
async function failedAttempts(identifier: string): Promise<number> {
  const cutoff = new Date(Date.now() - config.AUTH_LOCKOUT_MINUTES * 60 * 1000);
  const rows = await db
    .select({ value: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, identifier), eq(loginAttempts.success, false), gt(loginAttempts.attemptedAt, cutoff)));
  return rows[0]?.value ?? 0;
}

async function recordFailedAttempt(identifier: string, ip: string) {
  await db.insert(loginAttempts).values({ email: identifier, ip, success: false });
}

async function clearAttempts(identifier: string) {
  await db.delete(loginAttempts).where(and(eq(loginAttempts.email, identifier), eq(loginAttempts.success, false)));
}

/** Deliver a code over the right channel with the proper branded template. */
async function deliverOtp(identifier: string, code: string, purpose: OtpPurpose, resetLink?: string) {
  if (isEmail(identifier)) {
    const expiresMinutes = Math.round(config.OTP_TTL_SECONDS / 60);
    if (purpose === 'reset' && resetLink) {
      await deliverEmail(
        identifier,
        'Reset your PC MAX password',
        renderPasswordResetEmail(identifier, resetLink, code, expiresMinutes),
        'password_reset',
        mail,
      );
    } else {
      await deliverEmail(
        identifier,
        'Verify your PC MAX email',
        renderVerificationEmail(identifier, code, expiresMinutes),
        'verification',
        mail,
      );
    }
  } else {
    await sms.send(identifier, `PC MAX verification code: ${code}`);
  }
}

/**
 * Shared OTP-send logic (rate-limited route). Identifier is pre-normalized.
 * For email resets an optional single-use link token is embedded in the email.
 */
async function sendOtp(identifier: string, purpose: OtpPurpose, resetLink?: string) {
  const { devCode } = await issueOtp(identifier, purpose);
  if (devCode) await deliverOtp(identifier, devCode, purpose, resetLink);
  return { ok: true, ...(config.OTP_EXPOSE && devCode ? { devCode } : {}) };
}

export async function authUserModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/auth/otp/send',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { body: OtpSendInput, response: { 200: OtpSendResponse } },
    },
    async (request) => {
      const id = normalizeIdentifier(request.body.identifier);
      if (!id) throw badRequest('Invalid email or phone number');
      return sendOtp(id.value, request.body.purpose);
    },
  );

  typed.post(
    '/auth/register',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { body: RegisterInput, response: { 201: UserAuthResponse } },
    },
    async (request, reply) => {
      const { identifier, username, password, otp } = request.body;
      const id = normalizeIdentifier(identifier);
      if (!id) throw badRequest('Invalid email or phone number');
      const isEmailId = id.kind === 'email';

      const existing = await db.query.users.findFirst({ where: userByIdentifier(id.value) });
      if (existing) {
        throw conflict(isEmailId ? 'An account with this email already exists' : 'An account with this phone number already exists');
      }
      if (username) {
        const taken = await db.query.users.findFirst({ where: eq(users.username, username) });
        if (taken) throw conflict('This username is already taken');
      }

      const verified = await verifyOtp(id.value, 'register', otp);
      if (!verified) throw badRequest('Invalid or expired verification code');

      const [row] = await db
        .insert(users)
        .values({
          ...(isEmailId ? { email: id.value, emailVerified: true } : { phone: id.value, phoneVerified: true }),
          username: username ?? null,
          passwordHash: await hashPassword(password),
          role: 'user',
          status: 'active',
          lastLoginAt: new Date(),
        })
        .returning();
      const user = row!;

      const refreshToken = await createUserSession(user.id, request.ip, request.headers['user-agent']);
      setRefreshCookie(reply, refreshToken);
      void reply.code(201);
      return {
        accessToken: signUserAccessToken(user.id, user.tokenVersion),
        expiresIn: ACCESS_TTL_SECONDS,
        user: toUserPublic(user),
      };
    },
  );

  typed.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { body: UserLoginInput, response: { 200: UserAuthResponse } },
    },
    async (request, reply) => {
      const { identifier, password } = request.body;
      const id = normalizeIdentifier(identifier);
      if (!id) throw badRequest('Invalid email or phone number');

      const failures = await failedAttempts(id.value);
      if (failures >= config.AUTH_MAX_FAILED_ATTEMPTS) {
        throw new AppError(
          429,
          'ACCOUNT_LOCKED',
          `Too many failed attempts. Try again in ${config.AUTH_LOCKOUT_MINUTES} minutes`,
        );
      }

      const user = await db.query.users.findFirst({ where: and(userByIdentifier(id.value), eq(users.status, 'active')) });
      // Runs the hash even when there is no match, so a wrong identifier and a
      // wrong password take the same time — the generic message below hides
      // nothing if the response time does not.
      const ok = await verifyPasswordOrDecoy(password, user?.passwordHash);
      if (!user || !ok) {
        await recordFailedAttempt(id.value, request.ip);
        throw unauthorized('Invalid email, phone number or password');
      }
      // Legacy email-era accounts (email set, no phone, no OTP back then) count
      // as verified — blocking them would lock out pre-OTP users. New email
      // registrations always pass an OTP and therefore have emailVerified=true.
      const verified =
        id.kind === 'email' ? user.emailVerified || user.phone === null : user.phoneVerified;
      if (!verified) throw unauthorized('Account is not verified');

      await clearAttempts(id.value);
      await db.update(users).set({ lastLoginAt: new Date(), lastSeenAt: new Date() }).where(eq(users.id, user.id));

      const refreshToken = await createUserSession(user.id, request.ip, request.headers['user-agent']);
      setRefreshCookie(reply, refreshToken);
      return {
        accessToken: signUserAccessToken(user.id, user.tokenVersion),
        expiresIn: ACCESS_TTL_SECONDS,
        user: toUserPublic(user),
      };
    },
  );

  typed.post('/auth/refresh', async (request, reply) => {
    const incoming = request.cookies[REFRESH_COOKIE];
    if (!incoming) throw unauthorized('No refresh token');

    const row = await db.query.userSessions.findFirst({
      where: and(
        eq(userSessions.tokenHash, sha256(incoming)),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date()),
      ),
    });
    if (!row) throw unauthorized('Invalid or expired refresh token');

    const user = await db.query.users.findFirst({ where: and(eq(users.id, row.userId), eq(users.status, 'active')) });
    if (!user) throw unauthorized('Account is no longer active');

    // Rotate: revoke the old session, create a new one.
    await db.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.id, row.id));
    const refreshToken = await createUserSession(user.id, request.ip, request.headers['user-agent']);
    setRefreshCookie(reply, refreshToken);

    return {
      accessToken: signUserAccessToken(user.id, user.tokenVersion),
      expiresIn: ACCESS_TTL_SECONDS,
      user: toUserPublic(user),
    };
  });

  typed.post('/auth/logout', async (request, reply) => {
    const incoming = request.cookies[REFRESH_COOKIE];
    if (incoming) {
      await db
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(eq(userSessions.tokenHash, sha256(incoming)));
    }
    clearRefreshCookie(reply);
    return { ok: true };
  });

  typed.post(
    '/auth/password/forgot',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: PasswordForgotInput, response: { 200: OtpSendResponse } },
    },
    async (request) => {
      const id = normalizeIdentifier(request.body.identifier);
      if (!id) throw badRequest('Invalid email or phone number');
      // Always succeeds (no user enumeration). A code is issued even when no
      // account exists (decoy); the reset step validates both together.
      let resetLink: string | undefined;
      if (id.kind === 'email') {
        const user = await db.query.users.findFirst({ where: userByIdentifier(id.value) });
        if (user) {
          // Single-use, expiring link token (hash-only stored).
          const { token, tokenHash } = generateSecureToken();
          await db.insert(passwordResets).values({
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + config.OTP_TTL_SECONDS * 1000),
          });
          resetLink = `${config.RESET_LINK_BASE_URL}/reset-password?token=${token}`;
        }
      }
      return sendOtp(id.value, 'reset', resetLink);
    },
  );

  /** Shared secure reset: new password + tokenVersion bump + session revoke. */
  async function performReset(userId: string, newPassword: string, identifierForAttempts: string) {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(newPassword), tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, userId));
      // Revoke every session AND bump the token version — the password
      // changed, so old refresh AND access tokens are invalid.
      await tx.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.userId, userId));
      await tx
        .delete(loginAttempts)
        .where(and(eq(loginAttempts.email, identifierForAttempts), lte(loginAttempts.attemptedAt, new Date())));
      await tx.delete(passwordResets).where(eq(passwordResets.userId, userId));
    });
  }

  typed.post(
    '/auth/password/reset',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { body: PasswordResetInput, response: { 200: PasswordResetResponse } },
    },
    async (request) => {
      const { identifier, otp, newPassword } = request.body;
      const id = normalizeIdentifier(identifier);
      if (!id) throw badRequest('Invalid email or phone number');

      const verified = await verifyOtp(id.value, 'reset', otp);
      if (!verified) throw badRequest('Invalid or expired verification code');

      const user = await db.query.users.findFirst({ where: userByIdentifier(id.value) });
      if (!user) throw badRequest('Invalid or expired verification code');

      await performReset(user.id, newPassword, id.value);
      return { ok: true };
    },
  );

  // Token-link reset (email): ${RESET_LINK_BASE_URL}/reset-password?token=…
  typed.post(
    '/auth/password/reset-link',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        body: z.object({ token: z.string().min(32).max(200), newPassword: z.string().min(8).max(200) }),
        response: { 200: PasswordResetResponse },
      },
    },
    async (request) => {
      const { token, newPassword } = request.body;
      const row = await db.query.passwordResets.findFirst({
        where: and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())),
      });
      if (!row) throw badRequest('Invalid or expired reset link');

      const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
      if (!user) throw badRequest('Invalid or expired reset link');

      await performReset(user.id, newPassword, user.phone ?? user.email ?? user.id);
      await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
      return { ok: true };
    },
  );

  typed.get(
    '/auth/me',
    {
      preHandler: [authenticateUser],
      schema: { response: { 200: UserPublic } },
    },
    async (request) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, request.user!.id) });
      if (!user) throw unauthorized('Account no longer exists');
      return toUserPublic(user);
    },
  );
}
