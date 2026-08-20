export const KDS_ORDER_STATUSES = ['CONFIRMED', 'PREPARING', 'READY'] as const;

export type KdsOrderStatus = (typeof KDS_ORDER_STATUSES)[number];
export type KdsLaneKey = 'TODO' | 'MAKING' | 'READY';
export type KdsUrgency = 'NORMAL' | 'WARNING' | 'CRITICAL';

export interface KdsOrderItemOptionDTO {
  id: string;
  name: string;
  groupName: string | null;
}

export interface KdsOrderItemDTO {
  id: string;
  productName: string;
  quantity: number;
  notes: string | null;
  options: KdsOrderItemOptionDTO[];
}

export interface KdsOrderDTO {
  id: string;
  orderNumber: number;
  modality: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  diningTableLabel: string | null;
  status: KdsOrderStatus;
  version: number;
  stageStartedAt: string;
  stageAlertThresholdMinutes: number;
  notes: string | null;
  items: KdsOrderItemDTO[];
}

export interface KdsLaneDTO {
  key: KdsLaneKey;
  items: KdsOrderDTO[];
  total: number;
}

export interface KdsSnapshotDTO {
  lanes: Record<KdsLaneKey, KdsLaneDTO>;
  total: number;
  truncated: boolean;
  estimatedTimeMaxMinutes: number;
  updatedAt: string;
}
