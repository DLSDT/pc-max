import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { AdminRole } from '@goh/validation';

/**
 * Access tokens are scoped by `kind` so an admin token can never be used as a
 * user token (and vice versa) even though they share the signing secret.
 */
export interface AccessTokenPayload {
  sub: string;
  kind: 'admin';
  role: AdminRole;
}

export interface UserAccessTokenPayload {
  sub: string;
  kind: 'user';
  /** users.token_version at signing time — checked on every request so a
   *  password reset revokes all outstanding access tokens. */
  tv: number;
}

export function signAccessToken(adminId: string, role: AdminRole): string {
  return jwt.sign({ sub: adminId, kind: 'admin', role } satisfies AccessTokenPayload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (payload.kind !== 'admin') throw new Error('Not an admin token');
  return payload;
}

export function signUserAccessToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, kind: 'user', tv: tokenVersion } satisfies UserAccessTokenPayload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyUserAccessToken(token: string): UserAccessTokenPayload {
  const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as UserAccessTokenPayload;
  if (payload.kind !== 'user') throw new Error('Not a user token');
  return payload;
}
