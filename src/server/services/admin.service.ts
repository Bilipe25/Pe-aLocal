import type { TenantStatus } from '@prisma/client';

import { requireSuperAdmin } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { NotFoundError, ValidationError } from '@/server/errors';
import * as adminRepo from '@/server/repositories/admin.repository';

export async function getAdminDashboardData() {
  await requireSuperAdmin();
  return adminRepo.getPlatformOverview();
}

export async function getAdminTenantDetails(tenantId: string) {
  await requireSuperAdmin();
  if (!tenantId) throw new ValidationError('Tenant inválido.');
  return adminRepo.getTenantSupportDetails(tenantId);
}

export async function changeTenantStatus(
  tenantId: string,
  nextStatus: Extract<TenantStatus, 'ACTIVE' | 'SUSPENDED'>,
) {
  const session = await requireSuperAdmin();
  if (!tenantId || !['ACTIVE', 'SUSPENDED'].includes(nextStatus)) {
    throw new ValidationError('Status de tenant inválido.');
  }

  return getDb().$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    if (tenant.status === nextStatus) return tenant;

    const updated = await tx.tenant.update({
      where: { id: tenantId },
      data: { status: nextStatus },
      select: { id: true, name: true, status: true },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: nextStatus === 'ACTIVE' ? 'TENANT_ACTIVATED' : 'TENANT_SUSPENDED',
        entity: 'Tenant',
        entityId: tenantId,
        metadata: {
          previousStatus: tenant.status,
          nextStatus,
        },
      },
    });

    return updated;
  });
}
