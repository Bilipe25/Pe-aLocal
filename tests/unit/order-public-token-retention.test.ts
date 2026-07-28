import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ order: { findFirst: mocks.findFirst } }),
}));

import {
  getOrderByPublicToken,
  getOrderTrackingStateByPublicToken,
  isPublicOrderTokenExpired,
} from '@/server/repositories/order.repository';

describe('retenção do token público do pedido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
  });

  it('não consulta detalhes nem tracking depois da expiração', async () => {
    await getOrderByPublicToken('token-a');
    await getOrderTrackingStateByPublicToken('token-a', 'burger-do-ze');

    expect(mocks.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          publicToken: 'token-a',
          publicTokenExpiresAt: { gt: expect.any(Date) },
        },
      }),
    );
    expect(mocks.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          publicToken: 'token-a',
          publicTokenExpiresAt: { gt: expect.any(Date) },
          store: { slug: 'burger-do-ze' },
        },
      }),
    );
  });

  it('verifica a expiração sem carregar dados pessoais e sempre limita pelo slug', async () => {
    const expired = await isPublicOrderTokenExpired('token-a', 'burger-do-ze');

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        publicToken: 'token-a',
        publicTokenExpiresAt: { lte: expect.any(Date) },
        store: { slug: 'burger-do-ze' },
      },
      select: { id: true },
    });
    expect(expired).toBe(false);
  });
});
