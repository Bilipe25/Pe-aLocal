import { z } from 'zod';

const stringId = z.union([z.string(), z.number()]).transform(String);

function normalizeLiveMode(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export const mercadoPagoOAuthTokenSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().int().positive(),
    scope: z.string().default(''),
    user_id: stringId,
    refresh_token: z.string().min(1),
    public_key: z.string().optional(),
    live_mode: z.unknown(),
  })
  .superRefine((token, context) => {
    if (!token.access_token.startsWith('APP_USR-')) {
      context.addIssue({
        code: 'custom',
        path: ['access_token'],
        message: 'A credencial recebida não é compatível com a Orders API.',
      });
    }
    if (normalizeLiveMode(token.live_mode) === null) {
      context.addIssue({
        code: 'custom',
        path: ['live_mode'],
        message: 'Não foi possível determinar o ambiente da credencial.',
      });
    }
  })
  .transform((token) => ({
    ...token,
    live_mode: normalizeLiveMode(token.live_mode) as boolean,
  }));

const amountSchema = z.string().regex(/^\d+(?:\.\d{1,2})?$/u);

const mercadoPagoPaymentMethodSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  qr_code: z.string().optional(),
  ticket_url: z.string().url().optional(),
});

const mercadoPagoPaymentSchema = z.object({
  id: z.string().optional(),
  amount: amountSchema.optional(),
  paid_amount: amountSchema.optional(),
  status: z.string().optional(),
  status_detail: z.string().optional(),
  date_of_expiration: z.string().optional(),
  payment_method: mercadoPagoPaymentMethodSchema.default({}),
});

const mercadoPagoTransactionsSchema = z
  .object({
    payments: z.array(mercadoPagoPaymentSchema).default([]),
  })
  .default({ payments: [] });

const mercadoPagoOrderBaseSchema = z.object({
  id: z.string().min(1),
  external_reference: z.string().min(1),
  currency: z.string().length(3).optional(),
  total_amount: amountSchema,
  total_paid_amount: amountSchema.optional(),
  total_refunded_amount: amountSchema.optional(),
  status: z.string().min(1),
  status_detail: z.string().min(1),
  transactions: mercadoPagoTransactionsSchema,
});

/**
 * O POST /v1/orders não garante user_id nem currency na resposta de criação.
 * A resposta é persistida para apresentar o Pix, mas nunca promove o pedido.
 */
export const mercadoPagoCreatedOrderSchema = mercadoPagoOrderBaseSchema.extend({
  user_id: stringId.optional(),
});

/**
 * Consultas autenticadas são a fonte canônica para conciliação e exigem user_id.
 */
export const mercadoPagoOrderSchema = mercadoPagoOrderBaseSchema.extend({
  user_id: stringId,
});

export const mercadoPagoOrderSearchSchema = z.object({
  data: z.array(mercadoPagoOrderSchema).default([]),
});

export const mercadoPagoSellerProfileSchema = z.object({
  id: stringId,
  tags: z.array(z.string()).default([]),
});

export const mercadoPagoWebhookSchema = z
  .object({
    id: stringId,
    live_mode: z.boolean(),
    type: z.enum(['orders', 'order', 'mp-connect']),
    action: z.string(),
    user_id: stringId,
    application_id: stringId,
    api_version: z.string().optional(),
    date_created: z.string().optional(),
    data: z.object({ id: stringId }).strict(),
  })
  .strict();

/**
 * O botão "Testar URL" do painel envia uma sondagem assinada com uma order
 * fictícia expandida, sem o identificador do evento no nível raiz. Essa
 * sondagem comprova apenas conectividade e não pode entrar na reconciliação.
 */
export const mercadoPagoWebhookUrlValidationProbeSchema = z
  .object({
    action: z.string().regex(/^order\./u),
    api_version: z.string().optional(),
    application_id: stringId,
    data: z
      .object({
        external_reference: z.string().min(1),
        id: stringId,
        status: z.string().min(1),
        status_detail: z.string().min(1),
        total_paid_amount: z.union([z.string(), z.number()]),
        transactions: z
          .object({
            payments: z.array(z.unknown()).min(1),
          })
          .strict(),
        type: z.string().min(1),
        version: z.union([z.string(), z.number()]),
      })
      .strict(),
    date_created: z.string().optional(),
    live_mode: z.boolean(),
    type: z.literal('order'),
    user_id: stringId,
  })
  .strict();

export type MercadoPagoCreatedOrder = z.infer<typeof mercadoPagoCreatedOrderSchema>;
export type MercadoPagoOrder = z.infer<typeof mercadoPagoOrderSchema>;
