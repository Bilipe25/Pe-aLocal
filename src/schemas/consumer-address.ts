import { z } from 'zod';

const text = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null)
    .optional();

export const consumerAddressInputSchema = z
  .object({
    label: z.enum(['HOME', 'WORK', 'OTHER']).default('OTHER'),
    street: text(2, 160),
    number: text(1, 30),
    complement: optionalText(120),
    neighborhood: text(2, 120),
    city: text(2, 120),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/u),
    zipCode: z
      .string()
      .trim()
      .regex(/^\d{5}-?\d{3}$/u)
      .transform((value) => value.replace(/\D/gu, '')),
    reference: optionalText(200),
    isDefault: z.boolean().default(false),
  })
  .strict();

export type ConsumerAddressInput = z.infer<typeof consumerAddressInputSchema>;
