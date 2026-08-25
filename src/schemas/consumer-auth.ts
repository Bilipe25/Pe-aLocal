import { z } from 'zod';

import { normalizePhone, validateBrazilianPhone } from '@/lib/brazil';

const phoneSchema = z
  .string()
  .trim()
  .max(24)
  .refine(validateBrazilianPhone, 'Informe um celular brasileiro válido.')
  .transform(normalizePhone);

const emailSchema = z
  .string()
  .trim()
  .max(254, 'Informe um e-mail com até 254 caracteres.')
  .email('Informe um e-mail válido.')
  .refine((value) => /^[\x21-\x7e]+$/u.test(value), 'Use um e-mail com caracteres ASCII.')
  .transform((value) => value.toLowerCase());

const challengeTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u);

export const consumerVerificationRequestSchema = z
  .object({
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    purpose: z.enum(['LOGIN', 'ORDER_CLAIM', 'DEVICE_CLAIM']).default('LOGIN'),
    trackingToken: z.uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.phone && value.email) {
      context.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Informe apenas um meio de confirmação.',
      });
    }
    if (value.purpose !== 'ORDER_CLAIM' && !value.phone && !value.email) {
      context.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Informe um e-mail válido.',
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

export const consumerEmailChangeRequestSchema = z.object({ email: emailSchema }).strict();

export const consumerEmailChangeConfirmSchema = consumerVerificationConfirmSchema;

export type ConsumerVerificationRequest = z.infer<typeof consumerVerificationRequestSchema>;
