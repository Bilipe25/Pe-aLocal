// =============================================================================
// Tipos Globais — PedidoLocal
// =============================================================================

/**
 * Resultado paginado para listagens.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Parâmetros de paginação.
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * Parâmetros de ordenação.
 */
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Resultado de uma operação de mutação (para Server Actions).
 */
export type MutationResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

/**
 * Modalidades de atendimento.
 */
export type OrderModality = 'DELIVERY' | 'PICKUP';

/**
 * Formas de pagamento aceitas.
 */
export type PaymentMethod = 'PIX' | 'CASH' | 'CARD_ON_DELIVERY';

/**
 * Status do pedido.
 */
export type OrderStatus =
  | 'PENDING'
  | 'AWAITING_PAYMENT'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

/**
 * Status do pagamento.
 */
export type PaymentStatus =
  | 'PENDING'
  | 'CUSTOMER_REPORTED_PAID'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

/**
 * Dias da semana (para horários de funcionamento).
 */
export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';
