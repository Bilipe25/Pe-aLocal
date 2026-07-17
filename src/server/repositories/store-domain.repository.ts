import { Prisma } from '@prisma/client';

import { getDb } from '@/server/database/client';

export const domainSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  hostname: true,
  domainType: true,
  status: true,
  verificationToken: true,
  isPrimary: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreDomainSelect;

export function listAdminStoreDomains(tenantId: string, storeId: string) {
  return getDb().storeDomain.findMany({
    where: { tenantId, storeId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    select: domainSelect,
  });
}

export function findScopedStoreDomain(tenantId: string, storeId: string, domainId: string) {
  return getDb().storeDomain.findFirst({
    where: { id: domainId, tenantId, storeId },
    select: domainSelect,
  });
}

export function findActivePrimaryStoreDomain(tenantId: string, storeId: string) {
  return getDb().storeDomain.findFirst({
    where: { tenantId, storeId, status: 'ACTIVE', isPrimary: true },
    select: { id: true, hostname: true, domainType: true },
  });
}

export function findActiveStoreDomainByHostname(
  tenantId: string,
  storeId: string,
  hostname: string,
) {
  return getDb().storeDomain.findFirst({
    where: { tenantId, storeId, hostname, status: 'ACTIVE' },
    select: { id: true, hostname: true },
  });
}
