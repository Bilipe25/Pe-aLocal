import { z } from 'zod';

export const orderVersionInputSchema = z.object({
  orderId: z.string().uuid('O pedido informado é inválido.'),
  expectedVersion: z.number().int().nonnegative('A versão do pedido é inválida.'),
});

const cancellationReasonCodes = [
  'CUSTOMER_REQUEST',
  'PRODUCT_UNAVAILABLE',
  'STORE_UNABLE_TO_FULFILL',
  'ADDRESS_PROBLEM',
  'PAYMENT_NOT_IDENTIFIED',
  'DUPLICATE_ORDER',
  'FRAUD_SUSPECTED',
  'OTHER',
] as const;

const cancellationNoteSchema = z
  .string()
  .trim()
  .max(500, 'A observação deve ter no máximo 500 caracteres.')
  .refine((value) => !/<[^>]*>/.test(value), 'A observação não pode conter HTML.')
  .optional();

export const cancelOrderInputSchema = orderVersionInputSchema
  .extend({
    reasonCode: z.enum(cancellationReasonCodes),
    note: cancellationNoteSchema,
  })
  .superRefine((value, context) => {
    if (value.reasonCode === 'OTHER' && !value.note) {
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Informe uma observação para o motivo Outro.',
      });
    }
  });

export type OrderVersionInput = z.infer<typeof orderVersionInputSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;
