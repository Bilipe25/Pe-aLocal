import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getOrCreateDiningSessionForCheckout } from '@/server/services/dining-table-session.service';

function transactionDouble() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    diningTableSession: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'session-new', publicToken: 'S'.repeat(43) }),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
}

const table = { id: 'table-08', tenantId: 'tenant-a', storeId: 'store-a' };
const now = new Date('2026-08-20T18:00:00.000Z');

describe('lifecycle transacional da sessão de mesa', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria a primeira sessão somente dentro do checkout', async () => {
    const tx = transactionDouble();
    tx.diningTableSession.findFirst.mockResolvedValue(null);

    await expect(getOrCreateDiningSessionForCheckout(tx as never, table, now)).resolves.toEqual({
      id: 'session-new',
      publicToken: 'S'.repeat(43),
    });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.diningTableSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ diningTableId: 'table-08', openedAt: now }),
      }),
    );
  });

  it('reutiliza a sessão OPEN quando existe pedido ou pagamento pendente', async () => {
    const tx = transactionDouble();
    tx.diningTableSession.findFirst.mockResolvedValue({
      id: 'session-current',
      publicToken: 'C'.repeat(43),
      version: 3,
      openedAt: now,
      orders: [{ id: 'order-a', status: 'PREPARING', paymentStatus: 'PAID', total: 2_000 }],
      serviceRequests: [],
    });

    await expect(getOrCreateDiningSessionForCheckout(tx as never, table, now)).resolves.toEqual({
      id: 'session-current',
      publicToken: 'C'.repeat(43),
    });
    expect(tx.diningTableSession.updateMany).not.toHaveBeenCalled();
    expect(tx.diningTableSession.create).not.toHaveBeenCalled();
  });

  it('fecha e substitui atomicamente uma sessão totalmente resolvida', async () => {
    const tx = transactionDouble();
    tx.diningTableSession.findFirst.mockResolvedValue({
      id: 'session-old',
      publicToken: 'O'.repeat(43),
      version: 8,
      openedAt: now,
      orders: [{ id: 'order-a', status: 'DELIVERED', paymentStatus: 'PAID', total: 2_000 }],
      serviceRequests: [],
    });

    await getOrCreateDiningSessionForCheckout(tx as never, table, now);
    expect(tx.diningTableSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-old', status: 'OPEN', version: 8 },
      data: { status: 'CLOSED', closedAt: now, version: { increment: 1 } },
    });
    expect(tx.diningTableSession.create).toHaveBeenCalledOnce();
  });
});
