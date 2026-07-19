import type { Prisma, TenantStatus } from '@prisma/client';

import { getDb } from '@/server/database/client';

export interface AdminTenantListParams {
  query?: string;
  status?: TenantStatus;
  sort: 'newest' | 'name';
  page: number;
  pageSize: number;
}

export async function getPlatformOverview() {
  const db = getDb();
  const [totalTenants, activeTenants, suspendedTenants, totalUsers, tenants, auditLogs] =
    await Promise.all([
      db.tenant.count(),
      db.tenant.count({ where: { status: 'ACTIVE' } }),
      db.tenant.count({ where: { status: 'SUSPENDED' } }),
      db.user.count(),
      db.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          _count: { select: { members: true, stores: true } },
        },
      }),
      db.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          tenant: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

  return {
    metrics: { totalTenants, activeTenants, suspendedTenants, totalUsers },
    tenants,
    auditLogs,
  };
}

export async function listTenantsForAdmin(params: AdminTenantListParams) {
  const db = getDb();
  const where: Prisma.TenantWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.query
      ? {
          OR: [
            { name: { contains: params.query, mode: 'insensitive' } },
            { stores: { some: { name: { contains: params.query, mode: 'insensitive' } } } },
            { stores: { some: { slug: { contains: params.query, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.TenantOrderByWithRelationInput[] =
    params.sort === 'name'
      ? [{ name: 'asc' }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }];
  const [total, tenants] = await Promise.all([
    db.tenant.count({ where }),
    db.tenant.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        _count: { select: { members: true, stores: true } },
      },
    }),
  ]);
  return {
    total,
    tenants,
    page: params.page,
    pageSize: params.pageSize,
    pageCount: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export async function getTenantSupportDetails(tenantId: string) {
  return getDb().tenant.findUnique({
    where: { id: tenantId },
    include: {
      stores: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true, status: true, isActive: true },
      },
      members: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          isActive: true,
          createdAt: true,
          user: {
            select: { id: true, name: true, email: true, isActive: true, platformRole: true },
          },
        },
      },
    },
  });
}
