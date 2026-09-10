import { z } from 'zod';

export const customerRelationshipSegmentSchema = z.enum([
  'NEW',
  'RETURNING',
  'RECURRING',
  'FREQUENT',
  'COOLING',
  'INACTIVE',
  'RECOVERED',
]);

export const customerRelationshipFilterSchema = z.enum([
  'ALL',
  'NEW',
  'FREQUENT',
  'COOLING',
  'INACTIVE',
  'RECOVERED',
]);

export const customerRelationshipSortSchema = z.enum(['RECENT', 'FREQUENT', 'ATTENTION']);

export const customerReturnCampaignInputSchema = z
  .object({
    target: z.enum(['COOLING', 'INACTIVE', 'COOLING_AND_INACTIVE']),
    rewardType: z.enum(['FIXED_DISCOUNT', 'PERCENT_DISCOUNT', 'FREE_PRODUCT']),
    rewardValue: z.number().int().min(100).max(50_000).nullable(),
    percentageBasisPoints: z.number().int().min(100).max(5_000).nullable(),
    maximumDiscountValue: z.number().int().min(100).max(50_000).nullable(),
    freeProductId: z.string().uuid().nullable(),
    minimumOrderValue: z.number().int().min(0).max(500_000),
    validityDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.rewardType === 'FIXED_DISCOUNT' && value.rewardValue == null) {
      context.addIssue({
        code: 'custom',
        path: ['rewardValue'],
        message: 'Informe o valor do benefício.',
      });
    }
    if (value.rewardType === 'PERCENT_DISCOUNT' && value.percentageBasisPoints == null) {
      context.addIssue({
        code: 'custom',
        path: ['percentageBasisPoints'],
        message: 'Informe o percentual do benefício.',
      });
    }
    if (value.rewardType === 'FREE_PRODUCT' && value.freeProductId == null) {
      context.addIssue({
        code: 'custom',
        path: ['freeProductId'],
        message: 'Escolha o produto grátis.',
      });
    }
  });

export const consumerCommunicationPreferenceInputSchema = z
  .object({
    benefitEarnedEnabled: z.boolean(),
    benefitExpiringEnabled: z.boolean(),
    storeOffersEnabled: z.boolean(),
  })
  .strict();

export type CustomerReturnCampaignInput = z.infer<typeof customerReturnCampaignInputSchema>;
export type ConsumerCommunicationPreferenceInput = z.infer<
  typeof consumerCommunicationPreferenceInputSchema
>;
