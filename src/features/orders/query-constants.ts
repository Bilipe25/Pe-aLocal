import type { OrderStatus } from '@prisma/client';

export const ORDER_BOARD_LANE_PAGE_SIZE = 10;
export const ORDER_NOTIFICATION_SEEN_EVENT_LIMIT = 250;

export const ORDER_ACTIVE_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];

export const ORDER_FINISHED_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED'];
