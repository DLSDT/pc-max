import type { AdminRole } from '@goh/validation';
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
  }
}
