import { db } from '@/server/database/client';

// =============================================================================
// DeliveryZone Repository
// =============================================================================

export async function listDeliveryZones(tenantId: string, storeId: string) {
  return db.deliveryZone.findMany({
    where: { tenantId, storeId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function findDeliveryZoneById(id: string, tenantId: string) {
  return db.deliveryZone.findFirst({
    where: { id, tenantId },
  });
}

export async function createDeliveryZone(data: {
  tenantId: string;
  storeId: string;
  name: string;
  fee?: number;
  minOrderValue?: number | null;
  estimatedTime?: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  return db.deliveryZone.create({ data });
}

export async function updateDeliveryZone(
  id: string,
  tenantId: string,
  data: {
    name?: string;
    fee?: number;
    minOrderValue?: number | null;
    estimatedTime?: string;
    isActive?: boolean;
    sortOrder?: number;
  },
) {
  return db.deliveryZone.updateMany({
    where: { id, tenantId },
    data,
  });
}

export async function deleteDeliveryZone(id: string, tenantId: string) {
  return db.deliveryZone.deleteMany({
    where: { id, tenantId },
  });
}
