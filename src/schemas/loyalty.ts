import { z } from 'zod';

export const loyaltyProgramInputSchema = z
  .object({
    requiredOrders: z.coerce
      .number()
      .int()
      .min(2, 'Use pelo menos 2 pedidos.')
      .max(20, 'Use no máximo 20 pedidos.'),
    rewardValue: z.coerce
      .number()
      .int()
      .min(100, 'O benefício mínimo é R$ 1,00.')
      .max(100_000, 'O benefício máximo é R$ 1.000,00.'),
    minimumOrderValue: z.coerce
      .number()
      .int()
      .min(0, 'O pedido mínimo não pode ser negativo.')
      .max(10_000_000, 'O pedido mínimo informado é muito alto.'),
    isActive: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.isActive &&
      value.minimumOrderValue > 0 &&
      value.rewardValue > value.minimumOrderValue
    ) {
      context.addIssue({
        code: 'custom',
        path: ['rewardValue'],
        message: 'O benefício não pode ser maior que o pedido mínimo.',
      });
    }
  });

export type LoyaltyProgramInput = z.input<typeof loyaltyProgramInputSchema>;
