import type { OrderOutboxEventType, OrderStatus, PaymentStatus } from '@prisma/client';

export interface StoreOrderNotificationState {
  eventType: OrderOutboxEventType;
  eventStatus: OrderStatus;
  currentStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  eventOrderId: string;
  currentOrderId: string;
  eventStoreId: string;
  currentStoreId: string;
  eventTenantId: string;
  currentTenantId: string;
}

export function shouldNotifyStoreAboutNewOrder(state: StoreOrderNotificationState): boolean {
  return (
    state.eventType === 'ORDER_CREATED' &&
    state.eventStatus === 'PENDING' &&
    state.currentStatus === 'PENDING' &&
    state.eventOrderId === state.currentOrderId &&
    state.eventStoreId === state.currentStoreId &&
    state.eventTenantId === state.currentTenantId
  );
}
