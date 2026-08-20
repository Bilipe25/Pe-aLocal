import { z } from 'zod';

import { DINING_TABLE_TOKEN_PATTERN, normalizeDiningTableLabel } from '@/domain/dining-tables';

export const diningTableTokenSchema = z
  .string()
  .regex(DINING_TABLE_TOKEN_PATTERN, 'O QR Code da mesa é inválido.');

export const diningTableLabelSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome da mesa.')
  .max(80, 'O nome deve ter no máximo 80 caracteres.')
  .refine((value) => normalizeDiningTableLabel(value).length > 0, 'Informe o nome da mesa.');

export const createDiningTablesBatchSchema = z
  .object({
    prefix: z.string().trim().min(1).max(40).default('Mesa'),
    start: z.coerce.number().int().min(1).max(9999).default(1),
    count: z.coerce.number().int().min(1).max(50),
  })
  .strict();

export const diningTableMutationSchema = z
  .object({
    tableId: z.string().uuid(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export const renameDiningTableSchema = diningTableMutationSchema
  .extend({ label: diningTableLabelSchema })
  .strict();

export const setDiningTableActiveSchema = diningTableMutationSchema
  .extend({ isActive: z.boolean() })
  .strict();

export type CreateDiningTablesBatchInput = z.input<typeof createDiningTablesBatchSchema>;
export type RenameDiningTableInput = z.input<typeof renameDiningTableSchema>;
export type SetDiningTableActiveInput = z.input<typeof setDiningTableActiveSchema>;
export type RotateDiningTableTokenInput = z.input<typeof diningTableMutationSchema>;
