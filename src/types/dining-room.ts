import type { DiningSessionFinancialSummary } from '@/domain/dining-room';

export type DiningRoomAttentionState = 'FREE' | 'OPEN' | 'ASSISTANCE' | 'BILL';

export interface DiningRoomTableDto {
  tableId: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  state: DiningRoomAttentionState;
  sessionId: string | null;
  sessionVersion: number | null;
  openedAt: string | null;
  lastOrderAt: string | null;
  orderCount: number;
  totalConsideredCents: number;
  pendingCents: number;
  openRequest: {
    id: string;
    type: 'ASSISTANCE' | 'BILL';
    version: number;
    createdAt: string;
  } | null;
}

export interface DiningRoomSnapshotDto {
  enabledForNewOrders: boolean;
  storeId: string;
  storeName: string;
  generatedAt: string;
  totals: {
    tables: number;
    open: number;
    assistance: number;
    bill: number;
  };
  tables: DiningRoomTableDto[];
}

export interface DiningSessionDetailDto {
  sessionId: string;
  version: number;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  table: { id: string; label: string; isActive: boolean };
  orders: Array<{
    id: string;
    orderNumber: number;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    total: number;
    originalTableLabel: string;
    createdAt: string;
  }>;
  financialSummary: DiningSessionFinancialSummary;
  closeEvaluation: {
    canClose: boolean;
    activeOrderCount: number;
    paymentsRequiringAction: number;
    openRequestCount: number;
    message: string | null;
  };
  requests: Array<{
    id: string;
    type: 'ASSISTANCE' | 'BILL';
    status: 'OPEN' | 'RESOLVED';
    version: number;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  transferDestinations: Array<{ id: string; label: string }>;
}

export interface PublicDiningSessionDto {
  state: 'OPEN' | 'CLOSED' | 'INVALID';
  tableLabel?: string;
  storeName?: string;
  continueOrderingHref?: string;
  publicOperationsEnabled?: boolean;
  assistanceRequested?: boolean;
  billRequested?: boolean;
}
