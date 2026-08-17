import type { AdminRole, UserRole, UserStatus } from '@goh/validation';
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated admin (set by the authenticate preHandler). */
    admin?: {
      id: string;
      email: string;
      name: string;
      role: AdminRole;
    };
    /** Authenticated end user (set by the authenticateUser preHandler). */
    user?: {
      id: string;
      email: string;
      role: UserRole;
      status: UserStatus;
    };
  }
}
