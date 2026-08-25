import { z } from 'zod';

import { normalizePhone, validateBrazilianPhone } from '@/lib/brazil';

const phoneSchema = z
  .string()
  .trim()
  .max(24)
  .refine(validateBrazilianPhone, 'Informe um celular brasileiro válido.')
  .transform(normalizePhone);

const challengeTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u);

export const consumerVerificationRequestSchema = z
  .object({
    phone: phoneSchema.optional(),
    purpose: z.enum(['LOGIN', 'ORDER_CLAIM', 'DEVICE_CLAIM']).default('LOGIN'),
    trackingToken: z.uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.purpose !== 'ORDER_CLAIM' && !value.phone) {
      context.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Informe um celular brasileiro válido.',
      });
    }
    if (value.purpose === 'ORDER_CLAIM' && !value.trackingToken) {
      context.addIssue({ code: 'custom', path: ['trackingToken'], message: 'Pedido inválido.' });
    }
    if (value.purpose !== 'ORDER_CLAIM' && value.trackingToken) {
      context.addIssue({ code: 'custom', path: ['trackingToken'], message: 'Pedido inválido.' });
    }
  });

export const consumerVerificationConfirmSchema = z
  .object({
    challengeToken: challengeTokenSchema,
    code: z.string().regex(/^\d{6}$/u, 'Digite os seis números recebidos.'),
  })
  .strict();

export const consumerVerificationResendSchema = z
  .object({ challengeToken: challengeTokenSchema })
  .strict();

export type ConsumerVerificationRequest = z.infer<typeof consumerVerificationRequestSchema>;
