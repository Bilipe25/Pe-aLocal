import { z } from 'zod';

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

export const orderQueueFiltersSchema = z
  .object({
    date: localDateSchema.optional(),
    status: orderStatusSchema.optional(),
    statuses: z.array(orderStatusSchema).max(8).optional(),
    paymentStatus: paymentStatusSchema.optional(),
    modality: z.enum(['DELIVERY', 'PICKUP']).optional(),
    query: z.string().trim().max(80).optional(),
    cursor: z.string().max(2_048).optional(),
    pageSize: z.number().int().min(1).max(100).default(30),
  })
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

export const orderDetailsInputSchema = z.object({
  orderId: z.string().uuid('O pedido informado é inválido.'),
});

export const orderHistoryInputSchema = orderDetailsInputSchema.extend({
  cursor: z.string().max(2_048).optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
});

export const dailyMetricsInputSchema = z.object({
  localDate: localDateSchema,
});

export const orderNotificationSignalsInputSchema = z.object({
  cursor: z.string().max(2_048).optional(),
  seenEventIds: z.array(z.string().uuid()).max(5_000).default([]),
});

export type OrderQueueFiltersInput = z.input<typeof orderQueueFiltersSchema>;
export type ParsedOrderQueueFilters = z.output<typeof orderQueueFiltersSchema>;
export type OrderHistoryInput = z.output<typeof orderHistoryInputSchema>;
export type OrderNotificationSignalsInput = z.output<typeof orderNotificationSignalsInputSchema>;
