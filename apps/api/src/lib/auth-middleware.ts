import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { admins, users } from '../db/schema';
import { verifyAccessToken, verifyUserAccessToken } from './jwt';
import { forbidden, unauthorized } from './errors';
import { can, type Permission } from './rbac';

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m?.[1] ?? null;
}

/** Verify the access token and load the admin. Throws 401 on any failure. */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearer(request.headers.authorization);
  if (!token) throw unauthorized('Missing access token');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Invalid or expired access token');
  }

  const admin = await db.query.admins.findFirst({
    where: eq(admins.id, payload.sub),
  });

  if (!admin || !admin.isActive) throw unauthorized('Account is disabled or no longer exists');

  request.admin = { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
}

/** PreHandler factory that authenticates AND checks a permission. */
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);
    const admin = request.admin!;
    if (!can(admin.role, permission)) throw forbidden(`Missing permission: ${permission}`);
  };
}

/** Verify a user access token and load the account. Throws 401/403 on failure. */
export async function authenticateUser(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearer(request.headers.authorization);
  if (!token) throw unauthorized('Missing access token');

  let payload;
  try {
    payload = verifyUserAccessToken(token);
  } catch {
    throw unauthorized('Invalid or expired access token');
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });
  if (!user) throw unauthorized('Account no longer exists');
  if (user.status === 'suspended') throw forbidden('Your account has been suspended');
  // Token versioning: a password reset bumps users.token_version, invalidating
  // every access token issued before it (stateless JWTs can't be revoked
  // otherwise). Tokens signed before this feature (no `tv` claim) read as 0.
  if ((payload.tv ?? 0) !== user.tokenVersion) throw unauthorized('Session was revoked — please sign in again');

  request.user = { id: user.id, email: user.email!, role: user.role, status: user.status };
}
