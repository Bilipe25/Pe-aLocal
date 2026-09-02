import { z } from 'zod';

export const loyaltyRewardTypeSchema = z.enum([
  'FIXED_DISCOUNT',
  'PERCENT_DISCOUNT',
  'FREE_PRODUCT',
]);

export const loyaltyValidityDaysSchema = z.union([
  z.literal(30),
  z.literal(60),
  z.literal(90),
  z.null(),
]);

const nullableCents = z.coerce.number().int().nullable().optional();

export const loyaltyProgramInputSchema = z
  .object({
    requiredOrders: z.coerce
      .number()
      .int()
      .min(2, 'Use pelo menos 2 pedidos.')
      .max(20, 'Use no máximo 20 pedidos.'),
    rewardType: loyaltyRewardTypeSchema.default('FIXED_DISCOUNT'),
    rewardValue: nullableCents,
    percentageBasisPoints: z.coerce.number().int().nullable().optional(),
    maximumDiscountValue: nullableCents,
    freeProductId: z.guid().nullable().optional(),
    validityDays: loyaltyValidityDaysSchema.default(null),
    minimumOrderValue: z.coerce
      .number()
      .int()
      .min(0, 'O pedido mínimo não pode ser negativo.')
      .max(10_000_000, 'O pedido mínimo informado é muito alto.'),
    isActive: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.rewardType === 'FIXED_DISCOUNT') {
      if (value.rewardValue == null || value.rewardValue < 100 || value.rewardValue > 100_000) {
        context.addIssue({
          code: 'custom',
          path: ['rewardValue'],
          message: 'Informe um benefício entre R$ 1,00 e R$ 1.000,00.',
        });
      }
      if (
        value.isActive &&
        value.minimumOrderValue > 0 &&
        value.rewardValue != null &&
        value.rewardValue > value.minimumOrderValue
      ) {
        context.addIssue({
          code: 'custom',
          path: ['rewardValue'],
          message: 'O benefício não pode ser maior que o pedido mínimo.',
        });
      }
    }

    if (value.rewardType === 'PERCENT_DISCOUNT') {
      if (
        value.percentageBasisPoints == null ||
        value.percentageBasisPoints < 100 ||
        value.percentageBasisPoints > 5_000
      ) {
        context.addIssue({
          code: 'custom',
          path: ['percentageBasisPoints'],
          message: 'Informe um desconto entre 1% e 50%.',
        });
      }
      if (
        value.maximumDiscountValue != null &&
        (value.maximumDiscountValue < 100 || value.maximumDiscountValue > 100_000)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['maximumDiscountValue'],
          message: 'O limite deve ficar entre R$ 1,00 e R$ 1.000,00.',
        });
      }
    }

    if (value.rewardType === 'FREE_PRODUCT' && !value.freeProductId) {
      context.addIssue({
        code: 'custom',
        path: ['freeProductId'],
        message: 'Escolha o produto que o cliente vai ganhar.',
      });
    }
  });

export type LoyaltyRewardType = z.infer<typeof loyaltyRewardTypeSchema>;
export type LoyaltyProgramInput = z.input<typeof loyaltyProgramInputSchema>;
export type ParsedLoyaltyProgramInput = z.output<typeof loyaltyProgramInputSchema>;
