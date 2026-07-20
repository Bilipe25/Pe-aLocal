import { getDb } from '@/server/database/client';
import type { AuditAction, Prisma } from '@prisma/client';

type AuditLogClient = Pick<Prisma.TransactionClient, 'auditLog'>;

// =============================================================================
// AuditLog Repository
// =============================================================================

/**
 * Registra uma ação de auditoria.
 * Nunca grava senhas, tokens ou dados sensíveis.
 */
export async function createAuditLog(
  data: {
    tenantId?: string | null;
    storeId?: string | null;
    userId?: string | null;
    action: AuditAction;
    entity: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
  client: AuditLogClient = getDb(),
) {
  return client.auditLog.create({
    data: {
      tenantId: data.tenantId ?? undefined,
      storeId: data.storeId ?? undefined,
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
