import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  KDS_SNAPSHOT_LIMIT,
  allocateKdsSnapshotLimits,
  getKdsSnapshot,
} from '@/server/services/kds-query.service';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ order: { findMany: mocks.findMany, groupBy: mocks.groupBy } }),
}));

const context = {
  tenantId: 'tenant-a',
  storeId: 'store-a',
  estimatedTimeMaxMinutes: 30,
};

type KdsStatus = 'CONFIRMED' | 'PREPARING' | 'READY';

function row(status: KdsStatus) {
  const changedAt = new Date('2026-08-18T12:00:00.000Z');
  return {
    id: `order-${status}`,
    orderNumber: status === 'CONFIRMED' ? 10 : status === 'PREPARING' ? 11 : 12,
    modality: 'PICKUP' as const,
    status,
    version: 4,
    statusChangedAt: changedAt,
    acceptedAt: status === 'CONFIRMED' ? changedAt : null,
    preparingAt: status === 'PREPARING' ? changedAt : null,
    readyAt: status === 'READY' ? changedAt : null,
    notes: 'Sem cebola',
    items: [
      {
        id: 'item-a',
        productName: 'Smash bacon',
        quantity: 2,
        notes: 'Bem passado',
        options: [{ id: 'option-a', optionName: 'Cheddar', groupName: 'Queijo' }],
      },
    ],
  };
}

describe('consulta dedicada do KDS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockImplementation(async (query: { where: { status: KdsStatus } }) => [
      row(query.where.status),
    ]);
    mocks.groupBy.mockResolvedValue([
      { status: 'CONFIRMED', _count: { _all: 1 } },
      { status: 'PREPARING', _count: { _all: 1 } },
      { status: 'READY', _count: { _all: 1 } },
    ]);
  });

  it('isola tenant/loja, exclui PII e ordena a etapa pelo ciclo atual', async () => {
    const result = await getKdsSnapshot(context);

    expect(mocks.findMany).toHaveBeenCalledTimes(3);
    const query = mocks.findMany.mock.calls[0]?.[0];
    expect(query.where).toEqual({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      status: 'CONFIRMED',
    });
    expect(query.orderBy).toEqual([{ statusChangedAt: 'asc' }, { id: 'asc' }]);
    expect(query.take).toBe(1);
    expect(JSON.stringify(query.select)).not.toMatch(
      /customer|phone|payment|address|total|deliveryStreet/i,
    );
    expect(result.lanes.TODO.items[0]).toMatchObject({
      status: 'CONFIRMED',
      stageAlertThresholdMinutes: 5,
      notes: 'Sem cebola',
      items: [
        expect.objectContaining({
          productName: 'Smash bacon',
          options: [{ id: 'option-a', name: 'Cheddar', groupName: 'Queijo' }],
        }),
      ],
    });
    expect(result.lanes.MAKING.items[0].stageAlertThresholdMinutes).toBe(30);
    expect(result.lanes.READY.items[0].stageAlertThresholdMinutes).toBe(15);
    expect(result.total).toBe(3);
    expect(result.estimatedTimeMaxMinutes).toBe(30);
  });

  it('mantém contagens reais e sinaliza backlog limitado', async () => {
    mocks.findMany.mockImplementation(
      async (query: { where: { status: KdsStatus }; take: number }) =>
        Array.from({ length: query.take }, (_, index) => ({
          ...row(query.where.status),
          id: `${query.where.status}-${index}`,
          orderNumber: index + 1,
        })),
    );
    mocks.groupBy.mockResolvedValue([
      { status: 'CONFIRMED', _count: { _all: KDS_SNAPSHOT_LIMIT + 20 } },
    ]);

    const result = await getKdsSnapshot(context);

    expect(result.lanes.TODO.items).toHaveLength(KDS_SNAPSHOT_LIMIT);
    expect(result.lanes.TODO.total).toBe(KDS_SNAPSHOT_LIMIT + 20);
    expect(result.total).toBe(KDS_SNAPSHOT_LIMIT + 20);
    expect(result.truncated).toBe(true);
  });

  it('reserva capacidade para cada etapa e reaproveita o espaço ocioso', async () => {
    mocks.findMany.mockImplementation(
      async (query: { where: { status: KdsStatus }; take: number }) =>
        Array.from({ length: query.take }, (_, index) => ({
          ...row(query.where.status),
          id: `${query.where.status}-${index}`,
          orderNumber: index + 1,
        })),
    );
    mocks.groupBy.mockResolvedValue([
      { status: 'CONFIRMED', _count: { _all: 1 } },
      { status: 'PREPARING', _count: { _all: 1 } },
      { status: 'READY', _count: { _all: 500 } },
    ]);

    const result = await getKdsSnapshot(context);

    expect(result.lanes.TODO.items).toHaveLength(1);
    expect(result.lanes.MAKING.items).toHaveLength(1);
    expect(result.lanes.READY.items).toHaveLength(KDS_SNAPSHOT_LIMIT - 2);
    expect(result.lanes.TODO.total).toBe(1);
    expect(result.lanes.MAKING.total).toBe(1);
    expect(result.lanes.READY.total).toBe(500);
  });

  it('distribui o limite de forma justa quando todas as etapas têm backlog', () => {
    const limits = allocateKdsSnapshotLimits({ CONFIRMED: 500, PREPARING: 500, READY: 500 });

    expect(Object.values(limits).reduce((sum, value) => sum + value, 0)).toBe(KDS_SNAPSHOT_LIMIT);
    expect(
      Math.max(...Object.values(limits)) - Math.min(...Object.values(limits)),
    ).toBeLessThanOrEqual(1);
  });
});
