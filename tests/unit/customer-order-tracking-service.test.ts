import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCustomerOrderTrackingState,
  toCustomerOrderTrackingState,
} from '@/server/services/customer-order-tracking.service';

const mocks = vi.hoisted(() => ({
  getOrderTrackingStateByPublicToken: vi.fn(),
}));

vi.mock('@/server/repositories/order.repository', () => ({
  getOrderTrackingStateByPublicToken: mocks.getOrderTrackingStateByPublicToken,
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

  it('consulta pelo token e slug canônico e aplica defaults seguros', async () => {
    mocks.getOrderTrackingStateByPublicToken.mockResolvedValue({
      ...base,
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
});
