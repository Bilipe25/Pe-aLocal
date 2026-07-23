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

const financialNoteSchema = z
  .string()
  .trim()
  .max(500, 'A observação deve ter no máximo 500 caracteres.')
  .refine((value) => !/<[^>]*>/.test(value), 'A observação não pode conter HTML.')
  .optional();

export const paymentFailureReasonCodes = [
  'PAYMENT_NOT_IDENTIFIED',
  'PROOF_INVALID',
  'OTHER',
] as const;

export const markPaymentFailedInputSchema = orderVersionInputSchema
  .extend({
    reasonCode: z.enum(paymentFailureReasonCodes),
    note: financialNoteSchema,
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

export const paymentRefundReasonCodes = [
  'CUSTOMER_REQUEST',
  'ORDER_CANCELLATION',
  'STORE_DECISION',
  'OTHER',
] as const;

export const refundPaymentInputSchema = orderVersionInputSchema
  .extend({
    reasonCode: z.enum(paymentRefundReasonCodes),
    note: financialNoteSchema,
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

export const reportPixPaymentInputSchema = z.object({
  reportToken: z.string().uuid('O código para informar o pagamento é inválido.'),
});

export const addInternalOrderNoteInputSchema = orderVersionInputSchema.extend({
  body: z
    .string()
    .trim()
    .min(1, 'Escreva a observação interna.')
    .max(1000, 'A observação interna deve ter no máximo 1000 caracteres.')
    .refine((value) => !/<[^>]*>/.test(value), 'A observação interna não pode conter HTML.'),
});

export type OrderVersionInput = z.infer<typeof orderVersionInputSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;
export type MarkPaymentFailedInput = z.infer<typeof markPaymentFailedInputSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentInputSchema>;
export type ReportPixPaymentInput = z.infer<typeof reportPixPaymentInputSchema>;
export type AddInternalOrderNoteInput = z.infer<typeof addInternalOrderNoteInputSchema>;
