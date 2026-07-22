import { describe, expect, it } from 'vitest';

import {
  getOrderOperationalSnapshot,
  type OrderOperationalInput,
} from '@/domain/orders/order-operations';

const createdAt = new Date('2026-07-22T12:00:00.000Z');

function input(overrides: Partial<OrderOperationalInput> = {}): OrderOperationalInput {
  return {
    status: 'PENDING' as const,
    modality: 'PICKUP' as const,
    paymentMethod: 'CASH' as const,
    paymentStatus: 'PENDING' as const,
    createdAt,
    acceptedAt: null,
    preparingAt: null,
    readyAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    statusChangedAt: createdAt,
    estimatedTimeMaxMinutes: 40,
    ...overrides,
  };
}

describe('tempo e alertas operacionais do pedido', () => {
  it('alerta pedido sem aceite após três minutos', () => {
    const snapshot = getOrderOperationalSnapshot(input(), new Date('2026-07-22T12:04:00.000Z'));

    expect(snapshot.stageLabel).toBe('Aguardando aceite');
    expect(snapshot.elapsedMinutes).toBe(4);
    expect(snapshot.alerts).toContainEqual(
      expect.objectContaining({ code: 'ACCEPTANCE_OVERDUE', severity: 'warning' }),
    );
  });

  it('usa a estimativa máxima da loja para alertar preparo atrasado', () => {
    const snapshot = getOrderOperationalSnapshot(
      input({
        status: 'PREPARING',
        acceptedAt: new Date('2026-07-22T12:02:00.000Z'),
        preparingAt: new Date('2026-07-22T12:05:00.000Z'),
        statusChangedAt: new Date('2026-07-22T12:05:00.000Z'),
      }),
      new Date('2026-07-22T12:46:00.000Z'),
    );

    expect(snapshot.durations.preparationMinutes).toBe(41);
    expect(snapshot.alerts).toContainEqual(
      expect.objectContaining({ code: 'PREPARATION_OVERDUE', label: 'Preparo acima de 40 min' }),
    );
  });

  it('diferencia espera de retirada e de despacho', () => {
    const readyAt = new Date('2026-07-22T12:10:00.000Z');
    const pickup = getOrderOperationalSnapshot(
      input({ status: 'READY', readyAt, statusChangedAt: readyAt }),
      new Date('2026-07-22T12:26:00.000Z'),
    );
    const delivery = getOrderOperationalSnapshot(
      input({ status: 'READY', modality: 'DELIVERY', readyAt, statusChangedAt: readyAt }),
      new Date('2026-07-22T12:16:00.000Z'),
    );

    expect(pickup.alerts[0]?.code).toBe('READY_WAITING_PICKUP');
    expect(delivery.alerts[0]?.code).toBe('READY_WAITING_DISPATCH');
  });

  it('sinaliza pagamento informado sem misturar pagamento com status operacional', () => {
    const snapshot = getOrderOperationalSnapshot(
      input({ paymentMethod: 'PIX', paymentStatus: 'CUSTOMER_REPORTED_PAID' }),
      new Date('2026-07-22T12:01:00.000Z'),
    );

    expect(snapshot.stageLabel).toBe('Aguardando aceite');
    expect(snapshot.alerts[0]?.code).toBe('PAYMENT_REVIEW_REQUIRED');
  });

  it('calcula durações encerradas sem continuar aumentando depois da entrega', () => {
    const snapshot = getOrderOperationalSnapshot(
      input({
        status: 'DELIVERED',
        modality: 'DELIVERY',
        acceptedAt: new Date('2026-07-22T12:02:00.000Z'),
        preparingAt: new Date('2026-07-22T12:05:00.000Z'),
        readyAt: new Date('2026-07-22T12:25:00.000Z'),
        dispatchedAt: new Date('2026-07-22T12:30:00.000Z'),
        deliveredAt: new Date('2026-07-22T12:50:00.000Z'),
        statusChangedAt: new Date('2026-07-22T12:50:00.000Z'),
      }),
      new Date('2026-07-22T15:00:00.000Z'),
    );

    expect(snapshot.durations).toEqual({
      acceptanceMinutes: 2,
      preparationMinutes: 20,
      readyMinutes: 5,
      deliveryMinutes: 20,
      totalMinutes: 50,
    });
    expect(snapshot.alerts).toEqual([]);
  });
});
