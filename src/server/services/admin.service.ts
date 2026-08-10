import { AuditAction, type TenantStatus } from '@prisma/client';

import { requireSuperAdmin, requireSuperAdminStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { NotFoundError, ValidationError } from '@/server/errors';
import * as adminRepo from '@/server/repositories/admin.repository';

export interface AdminAuditFilters {
  query?: string;
  action?: string;
  page?: string | number;
}

function normalizeAuditFilters(filters: AdminAuditFilters = {}) {
  const query = filters.query?.trim().slice(0, 120) || undefined;
  const action = Object.values(AuditAction).includes(filters.action as AuditAction)
    ? (filters.action as AuditAction)
    : undefined;
  const parsedPage = Number(filters.page);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  return { query, action, page };
}

export async function getAdminDashboardData(filters: AdminAuditFilters = {}) {
  await requireSuperAdmin();
  return adminRepo.getPlatformOverview({ ...normalizeAuditFilters(filters), pageSize: 25 });
}

export async function getAdminAuditExportData(filters: AdminAuditFilters = {}) {
  await requireSuperAdmin();
  return adminRepo.listAuditLogsForAdmin({
    ...normalizeAuditFilters(filters),
    page: 1,
    pageSize: 1000,
  });
}

export async function getAdminTenantDetails(tenantId: string) {
  await requireSuperAdmin();
  if (!tenantId) throw new ValidationError('Tenant inválido.');
  return adminRepo.getTenantSupportDetails(tenantId);
}

export interface AdminTenantFilters {
  query?: string;
  status?: string;
  sort?: string;
  page?: string | number;
}

export async function getAdminTenantsData(filters: AdminTenantFilters = {}) {
  await requireSuperAdmin();
  const query = filters.query?.trim().slice(0, 120) || undefined;
  const status = ['ACTIVE', 'SUSPENDED', 'PENDING'].includes(filters.status ?? '')
    ? (filters.status as TenantStatus)
    : undefined;
  const sort = filters.sort === 'name' ? 'name' : 'newest';
  const parsedPage = Number(filters.page);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  return adminRepo.listTenantsForAdmin({ query, status, sort, page, pageSize: 20 });
}

export async function getAdminStoreContext(tenantId: string, storeId: string) {
  const { store } = await requireSuperAdminStoreAccess(tenantId, storeId);
  return store;
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
