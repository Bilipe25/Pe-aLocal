import type { OrderStatus, PaymentStatus } from '@prisma/client';

export interface OrderMutationContext {
  tenantId: string;
  storeId: string;
  userId: string;
  userName: string;
  canConfirmPayment: boolean;
}

export interface OrderMutationResult {
  orderId: string;
  storeId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  version: number;
  paymentUpdated: boolean;
}
