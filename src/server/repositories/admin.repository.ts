import { getDb } from '@/server/database/client';

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
        take: 100,
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
