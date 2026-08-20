import 'server-only';

import type { Prisma } from '@prisma/client';

import { getDb } from '@/server/database/client';

export type DiningSessionClient = Pick<
  Prisma.TransactionClient,
  | 'diningTableSession'
  | 'diningTableServiceRequest'
  | 'storeDiningTable'
  | 'order'
  | '$queryRaw'
  | '$executeRaw'
>;

export const diningSessionOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  total: true,
  diningTableLabelSnapshot: true,
  createdAt: true,
} satisfies Prisma.OrderSelect;

export function findOpenSessionForTable(
  client: DiningSessionClient,
  scope: { tenantId: string; storeId: string; diningTableId: string },
) {
  return client.diningTableSession.findFirst({
    where: { ...scope, status: 'OPEN' },
    select: {
      id: true,
      publicToken: true,
      version: true,
      openedAt: true,
      orders: { select: diningSessionOrderSelect },
      serviceRequests: { where: { status: 'OPEN' }, select: { id: true } },
    },
  });
}

export function findPublicSession(publicToken: string) {
  return getDb().diningTableSession.findUnique({
    where: { publicToken },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      publicToken: true,
      status: true,
      version: true,
      diningTable: {
        select: { id: true, label: true, publicToken: true, isActive: true },
      },
      store: {
        select: {
          name: true,
          slug: true,
          entitlement: { select: { dineInQrEnabled: true } },
        },
      },
      serviceRequests: {
        where: { status: 'OPEN' },
        select: { type: true },
      },
    },
  });
}

export function listDiningRoomRows(tenantId: string, storeId: string) {
  return getDb().storeDiningTable.findMany({
    where: { tenantId, storeId },
    orderBy: [{ sortOrder: 'asc' }, { labelNormalized: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      label: true,
      sortOrder: true,
      isActive: true,
      sessions: {
        where: { status: 'OPEN' },
        take: 1,
        select: {
          id: true,
          version: true,
          openedAt: true,
          lastOrderAt: true,
          orders: { select: diningSessionOrderSelect },
          serviceRequests: {
            where: { status: 'OPEN' },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, type: true, version: true, createdAt: true },
          },
        },
      },
    },
  });
}

export function findDiningSessionDetail(tenantId: string, storeId: string, sessionId: string) {
  return getDb().diningTableSession.findFirst({
    where: { id: sessionId, tenantId, storeId },
    select: {
      id: true,
      version: true,
      status: true,
      openedAt: true,
      closedAt: true,
      diningTable: { select: { id: true, label: true, isActive: true } },
      orders: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: diningSessionOrderSelect,
      },
      serviceRequests: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          type: true,
          status: true,
          version: true,
          createdAt: true,
          resolvedAt: true,
        },
      },
    },
  });
}

export function listAvailableTransferDestinations(
  tenantId: string,
  storeId: string,
  currentTableId: string,
) {
  return getDb().storeDiningTable.findMany({
    where: {
      tenantId,
      storeId,
      isActive: true,
      id: { not: currentTableId },
      sessions: { none: { status: 'OPEN' } },
    },
    orderBy: [{ sortOrder: 'asc' }, { labelNormalized: 'asc' }, { id: 'asc' }],
    select: { id: true, label: true },
  });
}
