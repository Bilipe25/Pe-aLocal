import { z } from 'zod';

import {
  ORDER_BOARD_LANE_PAGE_SIZE,
  ORDER_NOTIFICATION_SEEN_EVENT_LIMIT,
} from '@/features/orders/query-constants';

const orderStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
]);

const paymentStatusSchema = z.enum([
  'PENDING',
  'CUSTOMER_REPORTED_PAID',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
]);

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'A data deve usar YYYY-MM-DD.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'A data informada é inválida.');

export const orderBoardLaneKeySchema = z.enum([
  'NEW',
  'PREPARATION',
  'READY_AND_DELIVERY',
  'FINISHED',
]);

const orderBoardFilterFields = {
  localDate: localDateSchema,
  statuses: z.array(orderStatusSchema).max(7).optional(),
  paymentStatus: paymentStatusSchema.optional(),
  modality: z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']).optional(),
  query: z.string().trim().max(80).optional(),
  onlyActive: z.boolean().default(false),
  delayedOnly: z.boolean().default(false),
};

function validateBoardQuery(value: { query?: string }, context: z.RefinementCtx) {
  if (value.query && !/^#?\d+$/.test(value.query) && value.query.length < 2) {
    context.addIssue({
      code: 'custom',
      path: ['query'],
      message: 'A busca textual deve ter pelo menos dois caracteres.',
    });
  }
}

function normalizeBoardFilters<
  T extends { query?: string; statuses?: Array<z.infer<typeof orderStatusSchema>> },
>(value: T): T {
  const normalized = { ...value };
  if (!normalized.query) delete normalized.query;
  if (normalized.statuses?.length) {
    normalized.statuses = [...new Set(normalized.statuses)] as T['statuses'];
  } else {
    delete normalized.statuses;
  }
  return normalized;
}

export const orderBoardFiltersSchema = z
  .object(orderBoardFilterFields)
  .strict()
  .superRefine(validateBoardQuery)
  .transform(normalizeBoardFilters);

export const orderBoardLaneInputSchema = z
  .object({
    ...orderBoardFilterFields,
    lane: orderBoardLaneKeySchema,
    cursor: z.string().max(2_048).optional(),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(ORDER_BOARD_LANE_PAGE_SIZE)
      .default(ORDER_BOARD_LANE_PAGE_SIZE),
  })
  .strict()
  .superRefine(validateBoardQuery)
  .transform(normalizeBoardFilters);

export const orderQueueFiltersSchema = z
  .object({
    date: localDateSchema.optional(),
    status: orderStatusSchema.optional(),
    statuses: z.array(orderStatusSchema).max(8).optional(),
    paymentStatus: paymentStatusSchema.optional(),
    modality: z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']).optional(),
    query: z.string().trim().max(80).optional(),
    cursor: z.string().max(2_048).optional(),
    pageSize: z.number().int().min(1).max(100).default(30),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status && value.statuses?.length) {
      context.addIssue({
        code: 'custom',
        path: ['statuses'],
        message: 'Use status ou statuses, não ambos.',
      });
    }
    if (value.query && !/^#?\d+$/.test(value.query) && value.query.length < 2) {
      context.addIssue({
        code: 'custom',
        path: ['query'],
        message: 'A busca textual deve ter pelo menos dois caracteres.',
      });
    }
  })
  .transform((value) => ({
    ...value,
    query: value.query || undefined,
    statuses: value.statuses?.length ? [...new Set(value.statuses)] : undefined,
  }));

export const orderDetailsInputSchema = z
  .object({
    orderId: z.string().uuid('O pedido informado é inválido.'),
  })
  .strict();

export const orderHistoryInputSchema = orderDetailsInputSchema.extend({
  cursor: z.string().max(2_048).optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
});

export const orderInternalNotesInputSchema = orderDetailsInputSchema.extend({
  cursor: z.string().max(2_048).optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
});

export const dailyMetricsInputSchema = z
  .object({
    localDate: localDateSchema,
  })
  .strict();

export const orderNotificationSignalsInputSchema = z
  .object({
    cursor: z.string().max(2_048).optional(),
    seenEventIds: z.array(z.string().uuid()).max(ORDER_NOTIFICATION_SEEN_EVENT_LIMIT).default([]),
  })
  .strict();

export type OrderQueueFiltersInput = z.input<typeof orderQueueFiltersSchema>;
export type ParsedOrderQueueFilters = z.output<typeof orderQueueFiltersSchema>;
export type OrderBoardFiltersInput = z.input<typeof orderBoardFiltersSchema>;
export type ParsedOrderBoardFilters = z.output<typeof orderBoardFiltersSchema>;
export type OrderBoardLaneInput = z.output<typeof orderBoardLaneInputSchema>;
export type OrderHistoryInput = z.output<typeof orderHistoryInputSchema>;
export type OrderInternalNotesInput = z.output<typeof orderInternalNotesInputSchema>;
export type OrderNotificationSignalsInput = z.output<typeof orderNotificationSignalsInputSchema>;
