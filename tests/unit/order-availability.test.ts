import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOrderAction } from '@/features/orders/actions';

const mocks = vi.hoisted(() => ({
  storeFindUnique: vi.fn(),
  getEffectiveStoreAvailabilityForTenant: vi.fn(),
  rateLimitCheck: vi.fn(),
  createOrder: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ store: { findUnique: mocks.storeFindUnique } }),
}));
vi.mock('@/server/services/store-availability.service', () => ({
  getEffectiveStoreAvailabilityForTenant: mocks.getEffectiveStoreAvailabilityForTenant,
}));
vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: { createOrder: { maxAttempts: 10, windowInSeconds: 60 } },
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
}));
vi.mock('@/server/repositories/order.repository', () => ({ createOrder: mocks.createOrder }));
vi.mock('@/lib/pusher/server', () => ({ triggerNewOrder: vi.fn() }));

const checkout = {
  customerName: 'Cliente Teste',
  customerPhone: '(85) 99999-9999',
  modality: 'PICKUP' as const,
  paymentMethod: 'PIX' as const,
  idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
  items: [
    {
      productId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      quantity: 1,
      optionIds: [],
    },
  ],
};

describe('disponibilidade na criação do pedido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true });
    mocks.storeFindUnique.mockResolvedValue({
      id: 'store-a',
      tenantId: 'tenant-a',
      status: 'OPEN',
      isActive: true,
      settings: {
        minOrderValue: 0,
        deliveryEnabled: true,
        pickupEnabled: true,
        acceptsPix: true,
        pixKeyType: 'EMAIL',
        pixKey: 'financeiro@loja.test',
        acceptsCash: true,
        acceptsCardOnDelivery: true,
      },
    });
  });

  it('bloqueia no servidor quando o tenant está suspenso, sem confiar no status OPEN', async () => {
    mocks.getEffectiveStoreAvailabilityForTenant.mockResolvedValue({
      acceptingOrders: false,
      state: 'TENANT_SUSPENDED',
      reason: 'Este estabelecimento está temporariamente indisponível.',
      nextTransitionAt: null,
    });

    const result = await createOrderAction('loja-a', checkout);

    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'BUSINESS_RULE_ERROR',
        message: 'Este estabelecimento está temporariamente indisponível.',
      },
    });
    expect(mocks.getEffectiveStoreAvailabilityForTenant).toHaveBeenCalledWith(
      'tenant-a',
      'store-a',
    );
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('bloqueia fora do horário antes de consultar produtos ou gravar o pedido', async () => {
    mocks.getEffectiveStoreAvailabilityForTenant.mockResolvedValue({
      acceptingOrders: false,
      state: 'CLOSED_BY_SCHEDULE',
      reason: 'Fechada agora pelo horário. Abre terça-feira às 18:00.',
      nextTransitionAt: new Date('2026-07-21T21:00:00.000Z'),
    });

    const result = await createOrderAction('loja-a', checkout);

    expect(result).toMatchObject({
      success: false,
      error: { code: 'BUSINESS_RULE_ERROR' },
    });
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('revalida a chave Pix no servidor antes de criar o pedido', async () => {
    mocks.getEffectiveStoreAvailabilityForTenant.mockResolvedValue({
      acceptingOrders: true,
      state: 'OPEN',
      reason: 'Aberta agora.',
      nextTransitionAt: null,
    });
    mocks.storeFindUnique.mockResolvedValueOnce({
      id: 'store-a',
      tenantId: 'tenant-a',
      status: 'OPEN',
      isActive: true,
      settings: {
        minOrderValue: 0,
        deliveryEnabled: true,
        pickupEnabled: true,
        acceptsPix: true,
        pixKeyType: 'EMAIL',
        pixKey: 'email-invalido',
        acceptsCash: true,
        acceptsCardOnDelivery: true,
      },
    });

    const result = await createOrderAction('loja-a', checkout);

    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'BUSINESS_RULE_ERROR',
        message: 'O Pix está temporariamente indisponível. Escolha outra forma de pagamento.',
      },
    });
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });
});
