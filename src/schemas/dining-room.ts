import { z } from 'zod';

export const diningSessionTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/u, 'Token de atendimento inválido.');

export const diningServiceRequestSchema = z.object({
  type: z.enum(['ASSISTANCE', 'BILL']),
  idempotencyKey: z.string().trim().min(16).max(80),
});

export const diningSessionMutationSchema = z.object({
  sessionId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
});

export const resolveDiningServiceRequestSchema = z.object({
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
});

export const transferDiningSessionSchema = diningSessionMutationSchema.extend({
  destinationTableId: z.string().uuid(),
});

export type DiningServiceRequestInput = z.input<typeof diningServiceRequestSchema>;
export type DiningSessionMutationInput = z.input<typeof diningSessionMutationSchema>;
export type ResolveDiningServiceRequestInput = z.input<typeof resolveDiningServiceRequestSchema>;
export type TransferDiningSessionInput = z.input<typeof transferDiningSessionSchema>;
