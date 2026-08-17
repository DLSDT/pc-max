import type { FastifyRequest } from 'fastify';
import { db } from '../db';
import { auditLogs } from '../db/schema';

interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Record an admin mutation in the audit log. Never throws (best-effort). */
export async function recordAudit(request: FastifyRequest, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      adminId: request.admin?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before === undefined ? null : entry.before,
      after: entry.after === undefined ? null : entry.after,
      ip: request.ip,
    });
  } catch (err) {
    request.log.error({ err }, 'Failed to write audit log');
  }
}

export const pick = <T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
};
