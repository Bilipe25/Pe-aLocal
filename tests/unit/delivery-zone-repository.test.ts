import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDeliveryZone,
  deleteDeliveryZone,
  updateDeliveryZone,
} from '@/server/repositories/delivery-zone.repository';

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    deliveryZonePostalRange: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    deliveryZone: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    tx,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
});

vi.mock('@/server/database/client', () => ({
  getDb: () => ({
    $transaction: mocks.transaction,
  }),
}));

const zoneInput = {
  tenantId: 'tenant-a',
  storeId: 'store-a',
  userId: 'owner-a',
  name: 'Centro',
  fee: 500,
  minOrderValue: 2_000,
  estimatedTime: '30-40 min',
  isActive: true,
  sortOrder: 1,
  postalRanges: [
    {
      postalCodeStart: '01000000',
      postalCodeEnd: '01049999',
    },
    {
      postalCodeStart: '01050000',
      postalCodeEnd: '01099999',
    },
  ],
};

const createdZone = {
  id: 'zone-a',
  ...zoneInput,
  postalRanges: zoneInput.postalRanges.map((range, index) => ({
    id: `range-${index + 1}`,
    deliveryZoneId: 'zone-a',
    tenantId: zoneInput.tenantId,
    storeId: zoneInput.storeId,
    isActive: true,
    ...range,
  })),
};

describe('delivery zone repository postal coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.tx.deliveryZonePostalRange.findFirst.mockResolvedValue(null);
    mocks.tx.deliveryZonePostalRange.deleteMany.mockResolvedValue({ count: 2 });
    mocks.tx.deliveryZone.findFirst.mockResolvedValue({ id: createdZone.id });
    mocks.tx.deliveryZone.create.mockResolvedValue(createdZone);
    mocks.tx.deliveryZone.update.mockResolvedValue(createdZone);
    mocks.tx.deliveryZone.delete.mockResolvedValue(createdZone);
    mocks.tx.auditLog.create.mockResolvedValue({ id: 'audit-a' });
  });

  it('isola a busca de sobreposição por tenant e loja e trata os limites como inclusivos', async () => {
    await createDeliveryZone(zoneInput);

    expect(mocks.tx.deliveryZonePostalRange.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        OR: [
          {
            postalCodeStart: { lte: '01049999' },
            postalCodeEnd: { gte: '01000000' },
          },
          {
            postalCodeStart: { lte: '01099999' },
            postalCodeEnd: { gte: '01050000' },
          },
        ],
      },
      select: {
        postalCodeStart: true,
        postalCodeEnd: true,
        deliveryZone: { select: { name: true } },
      },
    });

    const where = mocks.tx.deliveryZonePostalRange.findFirst.mock.calls[0][0].where;
    expect(where.OR[0].postalCodeStart.lte).toBe(zoneInput.postalRanges[0].postalCodeEnd);
    expect(where.OR[0].postalCodeEnd.gte).toBe(zoneInput.postalRanges[0].postalCodeStart);
  });

  it.each([
    {
      label: 'o CEP inicial existente coincide com o CEP final novo',
      overlap: {
        postalCodeStart: '01049999',
        postalCodeEnd: '01070000',
        deliveryZone: { name: 'Zona vizinha' },
      },
    },
    {
      label: 'o CEP final existente coincide com o CEP inicial novo',
      overlap: {
        postalCodeStart: '00990000',
        postalCodeEnd: '01000000',
        deliveryZone: { name: 'Zona vizinha' },
      },
    },
  ])('rejeita sobreposição quando $label', async ({ overlap }) => {
    mocks.tx.deliveryZonePostalRange.findFirst.mockResolvedValue(overlap);

    await expect(createDeliveryZone(zoneInput)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    expect(mocks.tx.deliveryZone.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('serializa a cobertura e grava zona e auditoria na mesma transação', async () => {
    const result = await createDeliveryZone(zoneInput);

    expect(result).toEqual(createdZone);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    });
    expect(mocks.tx.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.tx.deliveryZone.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        name: 'Centro',
        fee: 500,
        minOrderValue: 2_000,
        estimatedTime: '30-40 min',
        isActive: true,
        sortOrder: 1,
        postalRanges: {
          create: zoneInput.postalRanges.map((range) => ({
            tenantId: 'tenant-a',
            storeId: 'store-a',
            ...range,
          })),
        },
      },
      include: { postalRanges: true },
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        userId: 'owner-a',
        action: 'CREATE',
        entity: 'DeliveryZone',
        entityId: 'zone-a',
        metadata: {
          name: 'Centro',
          postalRangeCount: 2,
        },
      },
    });
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.deliveryZonePostalRange.findFirst.mock.invocationCallOrder[0],
    );
    expect(mocks.tx.deliveryZone.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.auditLog.create.mock.invocationCallOrder[0],
    );
  });

  it('não confirma a criação quando a auditoria falha dentro da transação', async () => {
    mocks.tx.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(createDeliveryZone(zoneInput)).rejects.toThrow('audit unavailable');
    expect(mocks.tx.deliveryZone.create).toHaveBeenCalledOnce();
  });

  it('no update exclui somente a própria zona da detecção e mantém todo o escopo', async () => {
    await updateDeliveryZone('zone-a', zoneInput);

    expect(mocks.tx.deliveryZone.findFirst).toHaveBeenCalledWith({
      where: { id: 'zone-a', tenantId: 'tenant-a', storeId: 'store-a' },
      select: { id: true },
    });
    expect(mocks.tx.deliveryZonePostalRange.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          deliveryZoneId: { not: 'zone-a' },
        }),
      }),
    );
    expect(mocks.tx.deliveryZonePostalRange.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        deliveryZoneId: 'zone-a',
      },
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        userId: 'owner-a',
        action: 'UPDATE',
        entityId: 'zone-a',
      }),
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    });
  });

  it('não altera zona de outro tenant ou estabelecimento', async () => {
    mocks.tx.deliveryZone.findFirst.mockResolvedValueOnce(null);

    await expect(updateDeliveryZone('zone-b', zoneInput)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });

    expect(mocks.tx.deliveryZonePostalRange.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.deliveryZonePostalRange.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.deliveryZone.update).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('exclui e audita somente após localizar a zona no mesmo tenant e loja', async () => {
    mocks.tx.deliveryZone.findFirst.mockResolvedValueOnce({
      id: 'zone-a',
      name: 'Centro',
    });

    await deleteDeliveryZone('zone-a', 'tenant-a', 'store-a', 'owner-a');

    expect(mocks.tx.deliveryZone.findFirst).toHaveBeenCalledWith({
      where: { id: 'zone-a', tenantId: 'tenant-a', storeId: 'store-a' },
      select: { id: true, name: true },
    });
    expect(mocks.tx.deliveryZone.delete).toHaveBeenCalledWith({ where: { id: 'zone-a' } });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        userId: 'owner-a',
        action: 'DELETE',
        entity: 'DeliveryZone',
        entityId: 'zone-a',
        metadata: { name: 'Centro' },
      },
    });
  });

  it('repete conflitos serializáveis sem duplicar a escrita confirmada', async () => {
    mocks.transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('serialization conflict', {
        code: 'P2034',
        clientVersion: '7.8.0',
      }),
    );

    await expect(createDeliveryZone(zoneInput)).resolves.toEqual(createdZone);

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.tx.deliveryZone.create).toHaveBeenCalledOnce();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
  });
});
