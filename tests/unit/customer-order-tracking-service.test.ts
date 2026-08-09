import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canAuthorizeCustomerOrderTracking,
  getCustomerOrderTrackingState,
  getCustomerOrderTrackingStates,
  toCustomerOrderTrackingState,
} from '@/server/services/customer-order-tracking.service';

const mocks = vi.hoisted(() => ({
  getOrderTrackingStateByPublicToken: vi.fn(),
  hasActiveOrderTrackingToken: vi.fn(),
  orderFindMany: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ order: { findMany: mocks.orderFindMany } }),
}));

vi.mock('@/server/repositories/order.repository', () => ({
  getOrderTrackingStateByPublicToken: mocks.getOrderTrackingStateByPublicToken,
  hasActiveOrderTrackingToken: mocks.hasActiveOrderTrackingToken,
}));

const base = {
  orderNumber: 42,
  modality: 'PICKUP' as const,
  status: 'PREPARING' as const,
  paymentStatus: 'PENDING' as const,
  version: 3,
  createdAt: new Date('2026-07-22T12:00:00.000Z'),
  statusChangedAt: new Date('2026-07-22T12:05:00.000Z'),
  preparingAt: new Date('2026-07-22T12:05:00.000Z'),
  readyAt: null,
  dispatchedAt: null,
  promisedFulfillmentMinAt: new Date('2026-07-22T12:35:00.000Z'),
  promisedFulfillmentMaxAt: new Date('2026-07-22T12:55:00.000Z'),
  updatedAt: new Date('2026-07-22T12:06:00.000Z'),
  cancellationReasonCode: null,
  estimatedTimeMinMinutes: 30,
  estimatedTimeMaxMinutes: 50,
};

describe('acompanhamento público do pedido', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gera uma previsão usando a etapa atual e sem dados pessoais', () => {
    const state = toCustomerOrderTrackingState(base);

    expect(state.estimate).toEqual({
      label: 'Previsão para retirada',
      minAt: '2026-07-22T12:35:00.000Z',
      maxAt: '2026-07-22T12:55:00.000Z',
    });
    expect(state).not.toHaveProperty('orderId');
    expect(state).not.toHaveProperty('customerPhone');
    expect(state).not.toHaveProperty('deliveryAddress');
  });

  it('comunica cancelamento sem expor a observação interna', () => {
    const state = toCustomerOrderTrackingState({
      ...base,
      status: 'CANCELLED',
      cancellationReasonCode: 'PRODUCT_UNAVAILABLE',
    });

    expect(state.estimate).toBeNull();
    expect(state.cancellationMessage).toBe(
      'A loja cancelou o pedido porque um item ficou indisponível.',
    );
    expect(JSON.stringify(state)).not.toContain('cancellationNote');
  });

  it('mantém a promessa criada no checkout mesmo se a configuração da loja mudar', () => {
    const state = toCustomerOrderTrackingState({
      ...base,
      promisedFulfillmentMinAt: new Date('2026-07-22T12:20:00.000Z'),
      promisedFulfillmentMaxAt: new Date('2026-07-22T12:40:00.000Z'),
      estimatedTimeMinMinutes: 90,
      estimatedTimeMaxMinutes: 120,
    });

    expect(state.estimate).toEqual({
      label: 'Previsão para retirada',
      minAt: '2026-07-22T12:20:00.000Z',
      maxAt: '2026-07-22T12:40:00.000Z',
    });
  });

  it('consulta pelo token e slug canônico e aplica defaults seguros', async () => {
    mocks.getOrderTrackingStateByPublicToken.mockResolvedValue({
      ...base,
      promisedFulfillmentMinAt: null,
      promisedFulfillmentMaxAt: null,
      store: { settings: null },
    });

    const result = await getCustomerOrderTrackingState('token-a', 'burger-do-ze');

    expect(mocks.getOrderTrackingStateByPublicToken).toHaveBeenCalledWith(
      'token-a',
      'burger-do-ze',
    );
    expect(result?.estimate).toEqual(
      expect.objectContaining({
        minAt: '2026-07-22T12:35:00.000Z',
        maxAt: '2026-07-22T12:55:00.000Z',
      }),
    );
  });

  it('autoriza o canal com a consulta mínima de existência', async () => {
    mocks.hasActiveOrderTrackingToken.mockResolvedValue(true);

    await expect(canAuthorizeCustomerOrderTracking('token-a', 'burger-do-ze')).resolves.toBe(true);
    expect(mocks.hasActiveOrderTrackingToken).toHaveBeenCalledWith('token-a', 'burger-do-ze');
    expect(mocks.getOrderTrackingStateByPublicToken).not.toHaveBeenCalled();
  });

  it('carrega o histórico em lote e preserva a ordem dos tokens', async () => {
    mocks.orderFindMany.mockResolvedValue([
      {
        ...base,
        publicToken: 'token-b',
        total: 4_290,
        items: [
          {
            productId: 'product-a',
            productName: 'X-Burguer',
            unitPrice: 4_290,
            quantity: 1,
          },
        ],
        store: { settings: null },
      },
    ]);

    const result = await getCustomerOrderTrackingStates(['token-a', 'token-b'], 'burger-do-ze');

    expect(mocks.orderFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicToken: { in: ['token-a', 'token-b'] },
          store: { slug: 'burger-do-ze' },
        }),
      }),
    );
    expect(result[0]).toBeNull();
    expect(result[1]).toEqual(
      expect.objectContaining({
        orderNumber: 42,
        totalCents: 4_290,
        itemsSummary: '1x X-Burguer',
      }),
    );
  });
});
