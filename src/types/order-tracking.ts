import type { OrderModality, OrderStatus, PaymentStatus } from '@prisma/client';

export interface CustomerOrderTrackingStateDTO {
  orderNumber: number;
  modality: OrderModality;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  version: number;
  statusChangedAt: string;
  updatedAt: string;
  estimate: {
    label: string;
    minAt: string;
    maxAt: string;
  } | null;
  cancellationMessage: string | null;
}

export interface CustomerOrderTrackingSignalDTO {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  version: number;
  timestamp: number;
}
