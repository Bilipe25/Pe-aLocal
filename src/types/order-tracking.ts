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
  itemsSummary?: string | null;
  totalCents?: number | null;
  items?: Array<{
    productId?: string;
    productName: string;
    unitPrice: number;
    quantity: number;
  }> | null;
}

export interface CustomerOrderTrackingSignalDTO {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  version: number;
  timestamp: number;
}

export interface CustomerOrderEventDTO {
  status: OrderStatus;
  label: string;
  timestamp: string;
  completed: boolean;
  current: boolean;
}

export interface CustomerOrderItemDetailDTO {
  id: string;
  productId?: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes?: string | null;
  itemTotal: number;
  imageUrl?: string | null;
  imageAssetId?: string | null;
  options: Array<{
    optionName: string;
    optionPrice: number;
  }>;
}

export interface CustomerOrderDetailsDTO {
  orderNumber: number;
  status: OrderStatus;
  statusLabel: string;
  statusChangedAt: string;
  createdAt: string;
  modality: OrderModality;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  deliveryAddress?: string | null;
  events: CustomerOrderEventDTO[];
  items: CustomerOrderItemDetailDTO[];
}
