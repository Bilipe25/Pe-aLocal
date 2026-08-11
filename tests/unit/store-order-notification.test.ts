import { describe, expect, it } from 'vitest';

import { shouldNotifyStoreAboutNewOrder } from '@/domain/orders/store-order-notification';

const base = {
  eventType: 'ORDER_CREATED' as const,
  eventStatus: 'PENDING' as const,
  currentStatus: 'PENDING' as const,
  paymentStatus: 'PENDING' as const,
  eventOrderId: 'order-1',
  currentOrderId: 'order-1',
  eventStoreId: 'store-1',
  currentStoreId: 'store-1',
  eventTenantId: 'tenant-1',
  currentTenantId: 'tenant-1',
};

describe('novo pedido operacional acionÃ¡vel', () => {
  it('aceita ORDER_CREATED PENDING mesmo com pagamento pendente', () => {
    expect(shouldNotifyStoreAboutNewOrder(base)).toBe(true);
  });

  it.each(['CONFIRMED', 'CANCELLED', 'AWAITING_PAYMENT'] as const)(
    'recusa pedido que jÃ¡ estÃ¡ em %s',
    (currentStatus) => {
      expect(shouldNotifyStoreAboutNewOrder({ ...base, currentStatus })).toBe(false);
    },
  );

  it('recusa cruzamento de tenant, loja ou pedido', () => {
    expect(shouldNotifyStoreAboutNewOrder({ ...base, currentTenantId: 'tenant-2' })).toBe(false);
    expect(shouldNotifyStoreAboutNewOrder({ ...base, currentStoreId: 'store-2' })).toBe(false);
    expect(shouldNotifyStoreAboutNewOrder({ ...base, currentOrderId: 'order-2' })).toBe(false);
  });
});
