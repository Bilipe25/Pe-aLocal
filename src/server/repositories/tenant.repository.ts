import { getDb } from '@/server/database/client';
import type { TenantStatus } from '@prisma/client';

// =============================================================================
// Tenant Repository
// =============================================================================

/**
 * Cria um novo tenant.
 */
export async function createTenant(data: {
  name: string;
  document?: string;
  status?: TenantStatus;
}) {
  return getDb().tenant.create({
    data: {
      name: data.name.trim(),
      document: data.document?.trim(),
      status: data.status ?? 'PENDING',
    },
  });
}

/**
 * Busca um tenant pelo ID.
 */
export async function findTenantById(id: string) {
  return getDb().tenant.findUnique({
    where: { id },
  });
}

/**
 * Lista tenants (para super admin).
 */
export async function listTenants(params?: {
  status?: TenantStatus;
  page?: number;
  pageSize?: number;
}) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    getDb().tenant.findMany({
      where: params?.status ? { status: params.status } : undefined,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    getDb().tenant.count({
      where: params?.status ? { status: params.status } : undefined,
    }),
  ]);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    hasNext: page * pageSize < total,
    hasPrev: page > 1,
  };
}

/**
 * Atualiza o status de um tenant.
 */
export async function updateTenantStatus(id: string, status: TenantStatus) {
  return getDb().tenant.update({
    where: { id },
    data: { status },
  });
}
