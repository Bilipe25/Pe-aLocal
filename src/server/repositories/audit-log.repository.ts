import { getDb } from '@/server/database/client';
import type { AuditAction, Prisma } from '@prisma/client';

// =============================================================================
// AuditLog Repository
// =============================================================================

/**
 * Registra uma ação de auditoria.
 * Nunca grava senhas, tokens ou dados sensíveis.
 */
export async function createAuditLog(data: {
  tenantId?: string | null;
  userId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return getDb().auditLog.create({
    data: {
      tenantId: data.tenantId ?? undefined,
      userId: data.userId ?? undefined,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId ?? undefined,
      metadata: data.metadata ?? undefined,
      ipAddress: data.ipAddress ?? undefined,
      userAgent: data.userAgent ?? undefined,
    },
  });
}
