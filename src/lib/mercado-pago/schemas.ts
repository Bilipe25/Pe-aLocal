import { z } from 'zod';

const stringId = z.union([z.string(), z.number()]).transform(String);

export const mercadoPagoOAuthTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().int().positive(),
  scope: z.string().default(''),
  user_id: stringId,
  refresh_token: z.string().min(1),
  public_key: z.string().optional(),
  live_mode: z.boolean(),
});

const mercadoPagoPaymentMethodSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  qr_code: z.string().optional(),
  ticket_url: z.string().url().optional(),
});

export const mercadoPagoOrderSchema = z.object({
  id: z.string().min(1),
  user_id: stringId,
  external_reference: z.string().min(1),
  currency: z.string().length(3),
  total_amount: z.string(),
  total_paid_amount: z.string().optional(),
  total_refunded_amount: z.string().optional(),
  status: z.string().min(1),
  status_detail: z.string().min(1),
  transactions: z.object({
    payments: z
      .array(
        z.object({
          id: z.string().optional(),
          amount: z.string().optional(),
          paid_amount: z.string().optional(),
          status: z.string().optional(),
          status_detail: z.string().optional(),
          date_of_expiration: z.string().optional(),
          payment_method: mercadoPagoPaymentMethodSchema,
        }),
      )
      .default([]),
  }),
});

export const mercadoPagoWebhookSchema = z
  .object({
    id: stringId,
    live_mode: z.boolean(),
    type: z.enum(['orders', 'order', 'mp-connect']),
    action: z.string(),
    user_id: stringId,
    api_version: z.string().optional(),
    date_created: z.string().optional(),
    data: z.object({ id: stringId }).strict(),
  })
  .strict();

export type MercadoPagoOrder = z.infer<typeof mercadoPagoOrderSchema>;
