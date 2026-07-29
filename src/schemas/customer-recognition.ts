import { z } from 'zod';

import { normalizePhone, validateBrazilianPhone } from '@/lib/brazil';

const normalizedNameInput = z
  .string()
  .trim()
  .min(2, 'Informe seu nome.')
  .max(100, 'O nome deve ter no máximo 100 caracteres.')
  .transform((value) => value.replace(/\s+/g, ' '));

export const customerRecognitionInputSchema = z
  .object({
    customerPhone: z
      .string()
      .trim()
      .max(24)
      .refine(validateBrazilianPhone, 'Informe um celular brasileiro válido.')
      .transform(normalizePhone),
    customerName: normalizedNameInput,
  })
  .strict();

export const customerRecognitionPatchSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('CONFIRM_ADDRESS'),
      opaqueReference: z
        .string()
        .trim()
        .min(32)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+$/, 'A referência do endereço é inválida.'),
    })
    .strict(),
  z.object({ action: z.literal('USE_NEW_ADDRESS') }).strict(),
]);

export type CustomerRecognitionInput = z.infer<typeof customerRecognitionInputSchema>;
export type CustomerRecognitionPatchInput = z.infer<typeof customerRecognitionPatchSchema>;
