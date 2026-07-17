import { getDb } from '@/server/database/client';
import type { TenantRole } from '@prisma/client';

// =============================================================================
// TenantMember Repository
// =============================================================================

/**
 * Busca o vínculo de um usuário com um tenant específico.
 */
export async function findMembership(userId: string, tenantId: string) {
  return getDb().tenantMember.findUnique({
    where: {
      tenantId_userId: { tenantId, userId },
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Busca o primeiro tenant ativo de um usuário.
 * Usado no login para determinar o contexto default.
 */
export async function findFirstActiveMembership(userId: string) {
  return getDb().tenantMember.findFirst({
    where: {
      userId,
      isActive: true,
      tenant: {
        status: 'ACTIVE',
      },
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          status: true,
          stores: {
            where: { isActive: true },
            select: { id: true, slug: true, name: true },
            take: 1,
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Cria um vínculo usuário ↔ tenant.
 */
export async function createMembership(data: {
  tenantId: string;
  userId: string;
  role: TenantRole;
}) {
  return getDb().tenantMember.create({
    data: {
      tenantId: data.tenantId,
      userId: data.userId,
      role: data.role,
    },
  });
}

/**
 * Lista membros de um tenant.
 */
export async function listTenantMembers(tenantId: string) {
  return getDb().tenantMember.findMany({
    where: { tenantId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Atualiza o role de um membro.
 */
export async function updateMemberRole(id: string, role: TenantRole) {
  return getDb().tenantMember.update({
    where: { id },
    data: { role },
  });
}
