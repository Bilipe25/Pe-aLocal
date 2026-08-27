import { z } from 'zod';

import { formatPhone, normalizePhone, validateBrazilianPhone } from '@/lib/brazil';

export const MAX_CHECKOUT_LINES = 50;
export const MAX_CHECKOUT_ITEM_QUANTITY = 99;
export const MAX_CHECKOUT_TOTAL_UNITS = 250;
export const MAX_CHECKOUT_OPTIONS_PER_LINE = 50;
export const MAX_POSTGRES_INTEGER_CENTS = 2_147_483_647;
export const CHECKOUT_ADDRESS_REFERENCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const boundedTrimmedString = (max: number) => z.string().trim().max(max);

export const postalCodeSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{8}$/, 'Informe um CEP com 8 números.'));

export const couponCodeSchema = z
  .string()
  .trim()
  .min(1, 'Informe o código do cupom.')
  .max(32, 'O cupom deve ter no máximo 32 caracteres.')
  .regex(/^[A-Za-z0-9_-]+$/, 'O cupom contém caracteres inválidos.')
  .transform((value) => value.toUpperCase());

export const checkoutItemSchema = z
  .object({
    kind: z.literal('PRODUCT').optional(),
    lineId: z.uuid(),
    productId: z.guid(),
    quantity: z.number().int().min(1).max(MAX_CHECKOUT_ITEM_QUANTITY),
    notes: boundedTrimmedString(500).optional().default(''),
    optionIds: z.array(z.guid()).max(MAX_CHECKOUT_OPTIONS_PER_LINE).default([]),
  })
  .strict()
  .refine((item) => new Set(item.optionIds).size === item.optionIds.length, {
    message: 'O item possui adicionais repetidos.',
    path: ['optionIds'],
  });

export const checkoutComboItemSchema = z
  .object({
    kind: z.literal('COMBO'),
    lineId: z.uuid(),
    comboId: z.guid(),
    quantity: z.number().int().min(1).max(MAX_CHECKOUT_ITEM_QUANTITY),
    components: z
      .array(
        z
          .object({
            comboItemId: z.guid(),
            notes: boundedTrimmedString(500).optional().default(''),
            optionIds: z.array(z.guid()).max(MAX_CHECKOUT_OPTIONS_PER_LINE).default([]),
          })
          .strict()
          .refine((component) => new Set(component.optionIds).size === component.optionIds.length, {
            message: 'O componente possui adicionais repetidos.',
            path: ['optionIds'],
          }),
      )
      .min(2, 'O combo deve ter pelo menos dois componentes.')
      .max(MAX_CHECKOUT_LINES)
      .refine(
        (components) =>
          new Set(components.map((component) => component.comboItemId)).size === components.length,
        { message: 'O combo possui componentes repetidos.' },
      ),
  })
  .strict();

export const checkoutCartLineSchema = z.union([checkoutItemSchema, checkoutComboItemSchema]);

const checkoutCartShape = {
  couponCode: couponCodeSchema.optional(),
  items: z
    .array(checkoutCartLineSchema)
    .min(1, 'O pedido deve ter pelo menos 1 item.')
    .max(MAX_CHECKOUT_LINES, `O pedido deve ter no máximo ${MAX_CHECKOUT_LINES} itens.`),
} as const;

const checkoutQuoteShape = {
  modality: z.enum(['DELIVERY', 'PICKUP']),
  loyaltyRewardId: z.guid().optional(),
  // O PostgreSQL aceita UUIDs legados sem bits RFC 4122 (usados pelo seed).
  // A consulta autoritativa ainda limita a zona por tenant e loja.
  deliveryZoneId: z.guid().optional(),
  deliveryPostalCode: postalCodeSchema.optional(),
  savedAddressReference: z
    .string()
    .regex(CHECKOUT_ADDRESS_REFERENCE_PATTERN, 'A referência do endereço é inválida.')
    .optional(),
  ...checkoutCartShape,
};

function addQuoteRefinements<T extends z.ZodTypeAny>(
  schema: T,
  { requireDeliverySelection = true }: { requireDeliverySelection?: boolean } = {},
) {
  return schema.superRefine((data: z.infer<T>, ctx) => {
    const quote = data as {
      modality: 'DELIVERY' | 'PICKUP';
      deliveryZoneId?: string;
      deliveryPostalCode?: string;
      savedAddressReference?: string;
      deliveryAddress?: unknown;
      items: Array<{ quantity: number }>;
    };
    if (
      requireDeliverySelection &&
      quote.modality === 'DELIVERY' &&
      !quote.deliveryZoneId &&
      !quote.savedAddressReference
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Escolha uma região atendida para calcular a entrega.',
        path: ['deliveryZoneId'],
      });
    }
    if (
      quote.modality === 'PICKUP' &&
      (quote.deliveryZoneId ||
        quote.deliveryPostalCode ||
        quote.savedAddressReference ||
        quote.deliveryAddress)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Retirada no local não utiliza endereço de entrega.',
        path: ['modality'],
      });
    }
    const totalUnits = quote.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalUnits > MAX_CHECKOUT_TOTAL_UNITS) {
      ctx.addIssue({
        code: 'custom',
        message: `O pedido deve ter no máximo ${MAX_CHECKOUT_TOTAL_UNITS} unidades.`,
        path: ['items'],
      });
    }
  });
}

export const checkoutQuoteSchema = addQuoteRefinements(z.object(checkoutQuoteShape).strict());

export const cartQuoteSchema = addQuoteRefinements(z.object(checkoutQuoteShape).strict(), {
  requireDeliverySelection: false,
});

export const dineInCheckoutQuoteSchema = z
  .object(checkoutCartShape)
  .strict()
  .superRefine((data, ctx) => {
    const totalUnits = data.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalUnits > MAX_CHECKOUT_TOTAL_UNITS) {
      ctx.addIssue({
        code: 'custom',
        message: `O pedido deve ter no máximo ${MAX_CHECKOUT_TOTAL_UNITS} unidades.`,
        path: ['items'],
      });
    }
  });

export const checkoutDeliveryAddressSchema = z
  .object({
    postalCode: postalCodeSchema.optional(),
    street: boundedTrimmedString(160).min(2, 'Informe a rua.'),
    number: boundedTrimmedString(30).min(1, 'Informe o número.'),
    complement: boundedTrimmedString(120).optional().default(''),
    reference: boundedTrimmedString(200).optional().default(''),
  })
  .strict();

const checkoutOrderShape = {
  ...checkoutQuoteShape,
  deliveryAddress: checkoutDeliveryAddressSchema.optional(),
  saveCustomerData: z.boolean().default(false),
  addressLabel: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
  setAddressAsDefault: z.boolean().default(false),
  paymentMethod: z.enum(['PIX', 'CASH', 'CARD_ON_DELIVERY']),
  payerEmail: z
    .string()
    .trim()
    .email('Informe um e-mail válido para gerar o Pix.')
    .max(254)
    .optional(),
  changeFor: z.number().int().min(1).max(MAX_POSTGRES_INTEGER_CENTS).optional(),
  notes: boundedTrimmedString(500).optional().default(''),
  expectedQuoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/i, 'A cotação do pedido é inválida.'),
  idempotencyKey: z.uuid(),
} as const;

const visitorCheckoutSchema = z
  .object({
    ...checkoutOrderShape,
    identityMode: z.literal('VISITOR'),
    customerName: boundedTrimmedString(100).min(2, 'Nome deve ter pelo menos 2 caracteres.'),
    customerPhone: z
      .string()
      .trim()
      .refine(validateBrazilianPhone, 'Telefone inválido. Ex: (11) 99999-9999')
      .transform((value) => formatPhone(normalizePhone(value))),
  })
  .strict();

const recognizedCheckoutSchema = z
  .object({
    ...checkoutOrderShape,
    identityMode: z.literal('RECOGNIZED'),
  })
  .strict();

const authenticatedCheckoutSchema = z
  .object({
    ...checkoutOrderShape,
    identityMode: z.literal('AUTHENTICATED'),
  })
  .strict();

export const checkoutSchema = addQuoteRefinements(
  z
    .discriminatedUnion('identityMode', [
      visitorCheckoutSchema,
      recognizedCheckoutSchema,
      authenticatedCheckoutSchema,
    ])
    .superRefine((data, ctx) => {
      if (data.identityMode === 'VISITOR' && data.savedAddressReference) {
        ctx.addIssue({
          code: 'custom',
          message: 'Endereços salvos exigem uma sessão de reconhecimento confirmada.',
          path: ['savedAddressReference'],
        });
      }
      if (
        data.identityMode === 'RECOGNIZED' &&
        !data.savedAddressReference &&
        data.modality === 'DELIVERY' &&
        !data.deliveryAddress
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Informe um novo endereço ou escolha um endereço salvo.',
          path: ['deliveryAddress'],
        });
      }
    })
    .superRefine((data, ctx) => {
      if (data.modality === 'DELIVERY' && !data.deliveryAddress && !data.savedAddressReference) {
        ctx.addIssue({
          code: 'custom',
          message: 'Informe um novo endereço ou escolha um endereço salvo.',
          path: ['deliveryAddress'],
        });
      }
      if (data.modality === 'DELIVERY' && data.deliveryAddress && data.savedAddressReference) {
        ctx.addIssue({
          code: 'custom',
          message: 'Escolha apenas um endereço para entrega.',
          path: ['savedAddressReference'],
        });
      }
      if (data.modality === 'DELIVERY' && data.deliveryAddress && !data.deliveryZoneId) {
        ctx.addIssue({
          code: 'custom',
          message: 'Escolha uma região atendida.',
          path: ['deliveryZoneId'],
        });
      }
      if (
        data.modality === 'DELIVERY' &&
        data.deliveryAddress &&
        data.deliveryPostalCode &&
        data.deliveryAddress.postalCode &&
        data.deliveryPostalCode !== data.deliveryAddress.postalCode
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'O CEP do endereço mudou. Calcule a entrega novamente.',
          path: ['deliveryAddress', 'postalCode'],
        });
      }
      if (data.paymentMethod === 'CASH' && data.changeFor != null && data.changeFor <= 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'O valor do troco deve ser maior que zero.',
          path: ['changeFor'],
        });
      }
      if (data.paymentMethod !== 'CASH' && data.changeFor != null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Troco é permitido somente para pagamento em dinheiro.',
          path: ['changeFor'],
        });
      }
      if (!data.saveCustomerData && data.setAddressAsDefault) {
        ctx.addIssue({
          code: 'custom',
          message: 'Ative o salvamento dos dados para definir um endereço principal.',
          path: ['setAddressAsDefault'],
        });
      }
      if (data.savedAddressReference && data.setAddressAsDefault) {
        ctx.addIssue({
          code: 'custom',
          message: 'O endereço salvo já possui suas preferências.',
          path: ['setAddressAsDefault'],
        });
      }
      if (data.setAddressAsDefault && data.modality !== 'DELIVERY') {
        ctx.addIssue({
          code: 'custom',
          message: 'Somente endereços de entrega podem ser definidos como principais.',
          path: ['setAddressAsDefault'],
        });
      }
    }),
);

export const dineInCheckoutSchema = z
  .object({
    ...checkoutCartShape,
    customerName: boundedTrimmedString(40).min(1, 'Informe como podemos chamar você.'),
    paymentMethod: z.enum(['PIX', 'CASH', 'CARD_IN_PERSON']),
    payerEmail: z
      .string()
      .trim()
      .email('Informe um e-mail válido para gerar o Pix.')
      .max(254)
      .optional(),
    notes: boundedTrimmedString(500).optional().default(''),
    expectedQuoteFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, 'A cotação do pedido é inválida.'),
    idempotencyKey: z.uuid(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const totalUnits = data.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalUnits > MAX_CHECKOUT_TOTAL_UNITS) {
      ctx.addIssue({
        code: 'custom',
        message: `O pedido deve ter no máximo ${MAX_CHECKOUT_TOTAL_UNITS} unidades.`,
        path: ['items'],
      });
    }
  });

export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;
export type DineInCheckoutQuoteInput = z.infer<typeof dineInCheckoutQuoteSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type DineInCheckoutInput = z.infer<typeof dineInCheckoutSchema>;
export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;
export type CheckoutComboItemInput = z.infer<typeof checkoutComboItemSchema>;
export type CheckoutCartLineInput = z.infer<typeof checkoutCartLineSchema>;
export type CheckoutDeliveryAddressInput = z.infer<typeof checkoutDeliveryAddressSchema>;
