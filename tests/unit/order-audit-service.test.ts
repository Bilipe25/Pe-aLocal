import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
}));

vi.mock('@/server/repositories/audit-log.repository', () => ({
  createAuditLog: mocks.createAuditLog,
}));

import { writeOrderCreatedAudit } from '@/server/services/order-audit.service';

describe('auditoria da criação do pedido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuditLog.mockResolvedValue({ id: 'audit-1' });
  });

  it('não sinaliza como novo um pedido que ainda aguarda o Pix', async () => {
    await writeOrderCreatedAudit({} as never, {
      tenantId: 'tenant-1',
      storeId: 'store-1',
      orderId: 'order-1',
      orderNumber: 47,
      status: 'AWAITING_PAYMENT',
    });

    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        metadata: expect.objectContaining({ lifecycle: 'AWAITING_PROVIDER_PAYMENT' }),
      }),
      expect.anything(),
    );
  });

  it('mantém ORDER_CREATED para pedidos que já nascem acionáveis', async () => {
    await writeOrderCreatedAudit({} as never, {
      tenantId: 'tenant-1',
      storeId: 'store-1',
      orderId: 'order-2',
      orderNumber: 48,
      status: 'PENDING',
    });

    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ORDER_CREATED',
        metadata: expect.objectContaining({ lifecycle: 'ACTIONABLE_ORDER_CREATED' }),
      }),
      expect.anything(),
    );
  });
});
