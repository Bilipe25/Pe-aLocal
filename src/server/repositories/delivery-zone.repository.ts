import { Prisma } from '@prisma/client';

import type { DeliveryPostalRangeInput } from '@/schemas/delivery';
import { getDb } from '@/server/database/client';
import { ConcurrencyError, ConflictError, NotFoundError } from '@/server/errors';

interface DeliveryZoneWrite {
  tenantId: string;
  storeId: string;
  userId: string;
  name: string;
  fee: number;
  minOrderValue: number | null;
  estimatedTime: string | null;
  isActive: boolean;
  sortOrder: number;
  postalRanges: DeliveryPostalRangeInput[];
}

const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 15_000,
} as const;

function isSerializableConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}

async function runSerializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await getDb().$transaction(operation, SERIALIZABLE_OPTIONS);
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === maxAttempts) throw error;
    }
  }
  throw new Error('unreachable delivery transaction retry state');
}

export async function listDeliveryZones(tenantId: string, storeId: string) {
  return getDb().deliveryZone.findMany({
    where: { tenantId, storeId },
    include: {
      postalRanges: {
        orderBy: [{ postalCodeStart: 'asc' }, { postalCodeEnd: 'asc' }],
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  });
}

async function lockStoreCoverage(tx: Prisma.TransactionClient, storeId: string) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${'delivery-coverage:' + storeId}, 0))
  `;
}

async function assertNoPostalRangeOverlap(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    storeId: string;
    postalRanges: DeliveryPostalRangeInput[];
    excludeDeliveryZoneId?: string;
  },
) {
  const overlap = await tx.deliveryZonePostalRange.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      ...(input.excludeDeliveryZoneId
        ? { deliveryZoneId: { not: input.excludeDeliveryZoneId } }
        : {}),
      OR: input.postalRanges.map((range) => ({
        postalCodeStart: { lte: range.postalCodeEnd },
        postalCodeEnd: { gte: range.postalCodeStart },
      })),
    },
    select: {
      postalCodeStart: true,
      postalCodeEnd: true,
      deliveryZone: { select: { name: true } },
    },
  });

  if (overlap) {
    throw new ConflictError(
      `A faixa informada se sobrepõe à zona “${overlap.deliveryZone.name}” (${overlap.postalCodeStart}–${overlap.postalCodeEnd}).`,
    );
  }
}

export async function createDeliveryZone(data: DeliveryZoneWrite) {
  return runSerializable(async (tx) => {
    await lockStoreCoverage(tx, data.storeId);
    await assertNoPostalRangeOverlap(tx, data);

    const zone = await tx.deliveryZone.create({
      data: {
        tenantId: data.tenantId,
        storeId: data.storeId,
        name: data.name,
        fee: data.fee,
        minOrderValue: data.minOrderValue,
        estimatedTime: data.estimatedTime,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        postalRanges: {
          create: data.postalRanges.map((range) => ({
            tenantId: data.tenantId,
            storeId: data.storeId,
            postalCodeStart: range.postalCodeStart,
            postalCodeEnd: range.postalCodeEnd,
          })),
        },
      },
      include: { postalRanges: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId: data.tenantId,
        storeId: data.storeId,
        userId: data.userId,
        action: 'CREATE',
        entity: 'DeliveryZone',
        entityId: zone.id,
        metadata: {
          name: zone.name,
          postalRangeCount: data.postalRanges.length,
        },
      },
    });
    return zone;
  });
}

export async function updateDeliveryZone(
  id: string,
  expectedUpdatedAt: Date,
  data: DeliveryZoneWrite,
) {
  return runSerializable(async (tx) => {
    await lockStoreCoverage(tx, data.storeId);
    const existing = await tx.deliveryZone.findFirst({
      where: { id, tenantId: data.tenantId, storeId: data.storeId },
      select: { id: true, updatedAt: true },
    });
    if (!existing) throw new NotFoundError('Zona de entrega');
    if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new ConcurrencyError('A zona de entrega');
    }

    await assertNoPostalRangeOverlap(tx, {
      ...data,
      excludeDeliveryZoneId: id,
    });
    await tx.deliveryZonePostalRange.deleteMany({
      where: { tenantId: data.tenantId, storeId: data.storeId, deliveryZoneId: id },
    });
    const zone = await tx.deliveryZone.update({
      where: { id },
      data: {
        name: data.name,
        fee: data.fee,
        minOrderValue: data.minOrderValue,
        estimatedTime: data.estimatedTime,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        postalRanges: {
          create: data.postalRanges.map((range) => ({
            tenantId: data.tenantId,
            storeId: data.storeId,
            postalCodeStart: range.postalCodeStart,
            postalCodeEnd: range.postalCodeEnd,
          })),
        },
      },
      include: { postalRanges: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId: data.tenantId,
        storeId: data.storeId,
        userId: data.userId,
        action: 'UPDATE',
        entity: 'DeliveryZone',
        entityId: zone.id,
        metadata: {
          name: zone.name,
          postalRangeCount: data.postalRanges.length,
        },
      },
    });
    return zone;
  });
}

export async function deleteDeliveryZone(
  id: string,
  expectedUpdatedAt: Date,
  tenantId: string,
  storeId: string,
  userId: string,
) {
  return runSerializable(async (tx) => {
    await lockStoreCoverage(tx, storeId);
    const zone = await tx.deliveryZone.findFirst({
      where: { id, tenantId, storeId },
      select: { id: true, name: true, updatedAt: true },
    });
    if (!zone) throw new NotFoundError('Zona de entrega');
    if (zone.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new ConcurrencyError('A zona de entrega');
    }

    await tx.deliveryZone.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        tenantId,
        storeId,
        userId,
        action: 'DELETE',
        entity: 'DeliveryZone',
        entityId: id,
        metadata: { name: zone.name },
      },
    });
  });
}
