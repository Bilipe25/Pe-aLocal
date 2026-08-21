import 'server-only';

import { getOrderStageAlertThresholdMinutes } from '@/domain/orders/order-operations';
import { getKdsLaneForStatus, isKdsOrderStatus } from '@/domain/orders/kds';
import { getDb } from '@/server/database/client';
import type { KdsLaneDTO, KdsOrderDTO, KdsOrderStatus, KdsSnapshotDTO } from '@/types/kds';
import { KDS_ORDER_STATUSES } from '@/types/kds';

export const KDS_SNAPSHOT_LIMIT = 200;

export interface KdsQueryContext {
  tenantId: string;
  storeId: string;
  estimatedTimeMaxMinutes: number;
}

function emptyLanes(): Record<KdsLaneDTO['key'], KdsLaneDTO> {
  return {
    TODO: { key: 'TODO', items: [], total: 0 },
    MAKING: { key: 'MAKING', items: [], total: 0 },
    READY: { key: 'READY', items: [], total: 0 },
  };
}

export function allocateKdsSnapshotLimits(
  counts: Record<KdsOrderStatus, number>,
): Record<KdsOrderStatus, number> {
  const baseLimit = Math.floor(KDS_SNAPSHOT_LIMIT / KDS_ORDER_STATUSES.length);
  const limits: Record<KdsOrderStatus, number> = {
    CONFIRMED: Math.min(counts.CONFIRMED, baseLimit),
    PREPARING: Math.min(counts.PREPARING, baseLimit),
    READY: Math.min(counts.READY, baseLimit),
  };
  let remaining = KDS_SNAPSHOT_LIMIT - Object.values(limits).reduce((sum, value) => sum + value, 0);

  while (remaining > 0) {
    let allocated = false;
    for (const status of KDS_ORDER_STATUSES) {
      if (remaining === 0) break;
      if (limits[status] >= counts[status]) continue;
      limits[status] += 1;
      remaining -= 1;
      allocated = true;
    }
    if (!allocated) break;
  }

  return limits;
}

export async function getKdsSnapshot(context: KdsQueryContext): Promise<KdsSnapshotDTO> {
  const database = getDb();
  const groupedCounts = await database.order.groupBy({
    by: ['status'],
    where: {
      tenantId: context.tenantId,
      storeId: context.storeId,
      status: { in: [...KDS_ORDER_STATUSES] },
    },
    _count: { _all: true },
  });
  const counts: Record<KdsOrderStatus, number> = { CONFIRMED: 0, PREPARING: 0, READY: 0 };
  for (const group of groupedCounts) {
    if (isKdsOrderStatus(group.status)) counts[group.status] = group._count._all;
  }
  const limits = allocateKdsSnapshotLimits(counts);
  const rowGroups = await Promise.all(
    KDS_ORDER_STATUSES.map((status) => {
      if (limits[status] === 0) return Promise.resolve([]);
      return database.order.findMany({
        where: {
          tenantId: context.tenantId,
          storeId: context.storeId,
          status,
        },
        orderBy: [{ statusChangedAt: 'asc' }, { id: 'asc' }],
        take: limits[status],
        select: {
          id: true,
          orderNumber: true,
          modality: true,
          origin: true,
          diningTableLabelSnapshot: true,
          diningTableSession: {
            select: {
              status: true,
              diningTable: { select: { label: true } },
            },
          },
          status: true,
          version: true,
          statusChangedAt: true,
          acceptedAt: true,
          preparingAt: true,
          readyAt: true,
          notes: true,
          items: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              productName: true,
              quantity: true,
              notes: true,
              offerGroup: { select: { id: true, nameSnapshot: true } },
              options: {
                orderBy: [{ groupPosition: 'asc' }, { position: 'asc' }, { id: 'asc' }],
                select: { id: true, optionName: true, groupName: true },
              },
            },
          },
        },
      });
    }),
  );
  const rows = rowGroups.flat();

  const lanes = emptyLanes();
  for (const group of groupedCounts) {
    if (!isKdsOrderStatus(group.status)) continue;
    lanes[getKdsLaneForStatus(group.status)].total = group._count._all;
  }

  for (const row of rows) {
    if (!isKdsOrderStatus(row.status)) continue;
    const stageStartedAt =
      row.status === 'CONFIRMED'
        ? (row.acceptedAt ?? row.statusChangedAt)
        : row.status === 'PREPARING'
          ? (row.preparingAt ?? row.statusChangedAt)
          : (row.readyAt ?? row.statusChangedAt);
    const threshold = getOrderStageAlertThresholdMinutes({
      status: row.status,
      modality: row.modality,
      estimatedTimeMaxMinutes: context.estimatedTimeMaxMinutes,
    });
    const order: KdsOrderDTO = {
      id: row.id,
      orderNumber: row.orderNumber,
      modality: row.modality,
      origin: row.origin,
      diningTableLabel:
        row.diningTableSession?.status === 'OPEN'
          ? row.diningTableSession.diningTable.label
          : row.diningTableLabelSnapshot,
      status: row.status,
      version: row.version,
      stageStartedAt: stageStartedAt.toISOString(),
      stageAlertThresholdMinutes: threshold ?? 1,
      notes: row.notes,
      items: row.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        notes: item.notes,
        offerGroup: item.offerGroup
          ? { id: item.offerGroup.id, name: item.offerGroup.nameSnapshot }
          : null,
        options: item.options.map((option) => ({
          id: option.id,
          name: option.optionName,
          groupName: option.groupName,
        })),
      })),
    };
    lanes[getKdsLaneForStatus(row.status)].items.push(order);
  }

  const total = groupedCounts.reduce((sum, group) => sum + group._count._all, 0);
  return {
    lanes,
    total,
    truncated: total > rows.length,
    estimatedTimeMaxMinutes: context.estimatedTimeMaxMinutes,
    updatedAt: new Date().toISOString(),
  };
}
