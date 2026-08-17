import { hash, verify } from '@node-rs/argon2';

/** Hash a password with Argon2id (OWASP-recommended defaults). */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Verify a plaintext password against an Argon2id hash. */
export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return verify(hashed, plain);
}
