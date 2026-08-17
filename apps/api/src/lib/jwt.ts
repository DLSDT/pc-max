import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { AdminRole } from '@goh/validation';

export interface AccessTokenPayload {
  sub: string;
  role: AdminRole;
}

export function signAccessToken(adminId: string, role: AdminRole): string {
  return jwt.sign({ sub: adminId, role } satisfies AccessTokenPayload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
}
