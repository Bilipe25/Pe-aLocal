import { Prisma } from '@prisma/client';

import { getDb } from '@/server/database/client';

export const diningTableAdminSelect = {
  id: true,
  label: true,
  labelNormalized: true,
  sortOrder: true,
  publicToken: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreDiningTableSelect;

export function listDiningTables(tenantId: string, storeId: string) {
  return getDb().storeDiningTable.findMany({
    where: { tenantId, storeId },
    orderBy: [{ sortOrder: 'asc' }, { labelNormalized: 'asc' }, { id: 'asc' }],
    select: diningTableAdminSelect,
  });
}

export function findDiningTableByPublicToken(publicToken: string) {
  return getDb().storeDiningTable.findUnique({
    where: { publicToken },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      label: true,
      isActive: true,
      version: true,
      store: {
        select: {
          id: true,
          tenantId: true,
          slug: true,
          name: true,
          description: true,
          logoUrl: true,
          coverUrl: true,
          timeZone: true,
          settings: {
            select: {
              minOrderValue: true,
              estimatedTimeMinMinutes: true,
              estimatedTimeMaxMinutes: true,
              acceptsPix: true,
              acceptsCash: true,
              acceptsCardInPerson: true,
              paymentMode: true,
            },
          },
          entitlement: {
            select: { dineInQrEnabled: true, onlinePaymentsEnabled: true },
          },
          paymentProviderConnections: {
            where: { provider: 'MERCADO_PAGO', status: 'ACTIVE' },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
}
