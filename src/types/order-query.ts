import type {
  OrderChangeSource,
  OrderModality,
  OrderStatus,
  PaymentMethodType,
  PaymentStatus,
} from '@prisma/client';

export interface OrderQueueFilters {
  date?: string;
  status?: OrderStatus;
  statuses?: OrderStatus[];
  paymentStatus?: PaymentStatus;
  modality?: OrderModality;
  query?: string;
  cursor?: string;
  pageSize: number;
}

export interface OrderQueueItemDTO {
  id: string;
  orderNumber: number;
  customerDisplayName: string;
  modality: OrderModality;
  paymentMethod: PaymentMethodType;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  total: number;
  itemCount: number;
  createdAt: string;
  statusChangedAt: string;
  version: number;
  hasCustomerNotes: boolean;
  hasInternalAlerts: boolean;
}

export interface OrderQueuePageDTO {
  items: OrderQueueItemDTO[];
  nextCursor: string | null;
  activeOrderCount: number | null;
  hasAbnormalActiveVolume: boolean;
}

export interface OrderNotificationSignalDTO {
  eventId: string;
  orderId: string;
  orderNumber: number;
  isNew: boolean;
  createdAt: string;
}

export interface OrderNotificationSignalsDTO {
  items: OrderNotificationSignalDTO[];
  processedEventIds: string[];
  nextCursor: string;
  hasMore: boolean;
}

export interface OrderAllowedActionsDTO {
  accept: boolean;
  startPreparation: boolean;
  markReady: boolean;
  dispatch: boolean;
  complete: boolean;
  cancel: boolean;
  confirmPayment: boolean;
  undo: boolean;
}

export interface OrderHistoryItemDTO {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorName: string;
  source: OrderChangeSource;
  reasonCode: string | null;
  note: string | null;
  isUndo: boolean;
  versionFrom: number | null;
  versionTo: number | null;
  createdAt: string;
}

export interface OrderHistoryPageDTO {
  items: OrderHistoryItemDTO[];
  nextCursor: string | null;
}

export interface OrderDetailsDTO {
  id: string;
  orderNumber: number;
  customer: {
    name: string;
    phone: string | null;
  };
  modality: OrderModality;
  delivery: {
    address: string | null;
    zoneName: string | null;
  };
  items: Array<{
    id: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    notes: string | null;
    itemTotal: number;
    options: Array<{ id: string; name: string; price: number }>;
  }>;
  totals: {
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
  };
  payment: {
    method: PaymentMethodType;
    status: PaymentStatus;
    changeFor: number | null;
    amount: number | null;
    paidAt: string | null;
  };
  status: OrderStatus;
  customerNotes: string | null;
  cancellation: {
    reasonCode: string | null;
    note: string | null;
    cancelledAt: string | null;
  };
  recentHistory: OrderHistoryItemDTO[];
  version: number;
  createdAt: string;
  statusChangedAt: string;
  lastChangedBy: string | null;
  allowedActions: OrderAllowedActionsDTO;
}

export interface DailyOrderMetricsDTO {
  financialMetricsVisible: boolean;
  orderCount: number;
  activeCount: number;
  completedCount: number;
  cancelledCount: number;
  grossSales: number | null;
  paidRevenue: number | null;
  pendingRevenue: number | null;
  averageTicket: number | null;
  pendingPaymentCount: number | null;
  averageAcceptanceMinutes: number | null;
  averagePreparationMinutes: number | null;
}

export interface ActiveOrderCountsDTO {
  total: number;
  pending: number;
  preparing: number;
  ready: number;
}
