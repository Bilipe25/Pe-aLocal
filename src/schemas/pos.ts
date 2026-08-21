import { z } from 'zod';

import { formatPhone, normalizePhone, validateBrazilianPhone } from '@/lib/brazil';
import {
  checkoutCartLineSchema,
  couponCodeSchema,
  MAX_CHECKOUT_LINES,
  MAX_CHECKOUT_TOTAL_UNITS,
  MAX_POSTGRES_INTEGER_CENTS,
  postalCodeSchema,
} from '@/schemas/checkout';

const trimmed = (max: number) => z.string().trim().max(max);

export const posManualDiscountSchema = z
  .object({
    mode: z.enum(['FIXED', 'PERCENTAGE']),
    value: z.number().int().min(1).max(MAX_POSTGRES_INTEGER_CENTS),
    reasonCode: z.enum(['COURTESY', 'SERVICE_RECOVERY', 'NEGOTIATED', 'OTHER']),
    reasonNote: trimmed(200).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.mode === 'PERCENTAGE' && data.value > 10_000) {
      ctx.addIssue({
        code: 'custom',
        message: 'O percentual deve ser de no máximo 100%.',
        path: ['value'],
      });
    }
    if (data.reasonCode === 'OTHER' && (!data.reasonNote || data.reasonNote.length < 3)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Descreva o motivo do desconto em pelo menos 3 caracteres.',
        path: ['reasonNote'],
      });
    }
    if (data.reasonCode !== 'OTHER' && data.reasonNote) {
      ctx.addIssue({
        code: 'custom',
        message: 'A observação é permitida somente para o motivo Outro.',
        path: ['reasonNote'],
      });
    }
  });

export const posDeliveryAddressSchema = z
  .object({
    customerAddressId: z.guid().optional(),
    deliveryZoneId: z.guid(),
    postalCode: postalCodeSchema.optional(),
    street: trimmed(160).min(2, 'Informe a rua.'),
    number: trimmed(30).min(1, 'Informe o número.'),
    complement: trimmed(120).optional().default(''),
    neighborhood: trimmed(120).min(2, 'Informe o bairro.'),
    city: trimmed(120).min(2, 'Informe a cidade.'),
    state: trimmed(2)
      .length(2, 'Informe a UF com 2 letras.')
      .transform((value) => value.toUpperCase()),
    reference: trimmed(200).optional().default(''),
    label: z.enum(['HOME', 'WORK', 'OTHER']).default('OTHER'),
  })
  .strict();

const baseShape = {
  modality: z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']),
  diningTableId: z.guid().optional(),
  customerId: z.guid().optional(),
  customerName: trimmed(100).optional().default(''),
  customerPhone: z
    .string()
    .trim()
    .optional()
    .default('')
    .transform((value, ctx) => {
      if (!value) return '';
      if (!validateBrazilianPhone(value)) {
        ctx.addIssue({ code: 'custom', message: 'Telefone inválido. Ex: (11) 99999-9999' });
        return z.NEVER;
      }
      return formatPhone(normalizePhone(value));
    }),
  deliveryAddress: posDeliveryAddressSchema.optional(),
  items: z
    .array(checkoutCartLineSchema)
    .min(1, 'O pedido deve ter pelo menos 1 item.')
    .max(MAX_CHECKOUT_LINES),
  couponCode: couponCodeSchema.optional(),
  manualDiscount: posManualDiscountSchema.optional(),
  notes: trimmed(500).optional().default(''),
} as const;

function addPosRefinements<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((raw: z.infer<T>, ctx) => {
    const data = raw as {
      modality: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
      diningTableId?: string;
      customerId?: string;
      customerName: string;
      customerPhone: string;
      deliveryAddress?: unknown;
      items: Array<{ quantity: number }>;
      paymentMethod?: 'PIX' | 'CASH' | 'CARD_ON_DELIVERY' | 'CARD_IN_PERSON';
      paidNow?: boolean;
      changeFor?: number;
      saveCustomerData?: boolean;
    };
    if (data.items.reduce((sum, item) => sum + item.quantity, 0) > MAX_CHECKOUT_TOTAL_UNITS) {
      ctx.addIssue({
        code: 'custom',
        message: `O pedido deve ter no máximo ${MAX_CHECKOUT_TOTAL_UNITS} unidades.`,
        path: ['items'],
      });
    }
    if (data.modality === 'DELIVERY') {
      if (!data.customerName || !data.customerPhone) {
        ctx.addIssue({
          code: 'custom',
          message: 'Entrega exige nome e telefone do cliente.',
          path: ['customerName'],
        });
      }
      if (!data.deliveryAddress) {
        ctx.addIssue({
          code: 'custom',
          message: 'Informe ou selecione um endereço de entrega.',
          path: ['deliveryAddress'],
        });
      }
    } else if (data.deliveryAddress) {
      ctx.addIssue({
        code: 'custom',
        message: 'Somente pedidos de entrega utilizam endereço.',
        path: ['deliveryAddress'],
      });
    }
    if (data.modality === 'DINE_IN' && !data.diningTableId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Selecione uma mesa ativa.',
        path: ['diningTableId'],
      });
    }
    if (data.modality !== 'DINE_IN' && data.diningTableId) {
      ctx.addIssue({
        code: 'custom',
        message: 'A mesa só pode ser usada na modalidade Mesa.',
        path: ['diningTableId'],
      });
    }
    if (data.saveCustomerData && (!data.customerName || !data.customerPhone)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe nome e telefone para salvar o cliente.',
        path: ['saveCustomerData'],
      });
    }
    if (data.paymentMethod === 'CARD_ON_DELIVERY' && data.modality !== 'DELIVERY') {
      ctx.addIssue({
        code: 'custom',
        message: 'Cartão na entrega é exclusivo para Delivery.',
        path: ['paymentMethod'],
      });
    }
    if (data.paymentMethod === 'CARD_IN_PERSON' && data.modality === 'DELIVERY') {
      ctx.addIssue({
        code: 'custom',
        message: 'Cartão presencial é exclusivo para Retirada ou Mesa.',
        path: ['paymentMethod'],
      });
    }
    if (data.modality === 'DELIVERY' && data.paidNow && data.paymentMethod !== 'PIX') {
      ctx.addIssue({
        code: 'custom',
        message: 'No Delivery, somente o Pix manual pode ser marcado como pago agora.',
        path: ['paidNow'],
      });
    }
    if (data.paymentMethod && data.paymentMethod !== 'CASH' && data.changeFor != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Troco é permitido somente para pagamento em dinheiro.',
        path: ['changeFor'],
      });
    }
  });
}

export const posQuoteSchema = addPosRefinements(z.object(baseShape).strict());

export const posOrderSchema = addPosRefinements(
  z
    .object({
      ...baseShape,
      paymentMethod: z.enum(['PIX', 'CASH', 'CARD_ON_DELIVERY', 'CARD_IN_PERSON']),
      paidNow: z.boolean().default(false),
      changeFor: z.number().int().min(1).max(MAX_POSTGRES_INTEGER_CENTS).optional(),
      saveCustomerData: z.boolean().default(false),
      posTerminalId: z.guid().optional(),
      draftId: z.guid().optional(),
      expectedDraftVersion: z.number().int().min(0).optional(),
      expectedQuoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
      idempotencyKey: z.uuid(),
    })
    .strict(),
).superRefine((data, ctx) => {
  if (Boolean(data.draftId) !== (data.expectedDraftVersion != null)) {
    ctx.addIssue({
      code: 'custom',
      message: 'A versão do pedido em espera é obrigatória.',
      path: ['expectedDraftVersion'],
    });
  }
});

export const posDraftIntentSchema = addPosRefinements(
  z
    .object({
      ...baseShape,
      paymentMethod: z.enum(['PIX', 'CASH', 'CARD_ON_DELIVERY', 'CARD_IN_PERSON']).optional(),
      paidNow: z.boolean().default(false),
      changeFor: z.number().int().min(1).max(MAX_POSTGRES_INTEGER_CENTS).optional(),
      saveCustomerData: z.boolean().default(false),
    })
    .strict(),
);

export const savePosDraftSchema = z
  .object({
    draftId: z.guid().optional(),
    expectedVersion: z.number().int().min(0).optional(),
    terminalId: z.guid().optional(),
    intent: posDraftIntentSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.expectedVersion != null && !data.draftId) {
      ctx.addIssue({
        code: 'custom',
        message: 'A versão do pedido em espera é obrigatória.',
        path: ['expectedVersion'],
      });
    }
  });

export const mutatePosDraftSchema = z
  .object({ draftId: z.guid(), expectedVersion: z.number().int().min(0) })
  .strict();

export const posTerminalSchema = z
  .object({
    id: z.guid().optional(),
    name: trimmed(80).min(1, 'Informe o nome do terminal.'),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.id && data.expectedVersion == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'A versão do terminal é obrigatória.',
        path: ['expectedVersion'],
      });
    }
  });

export const mutatePosTerminalSchema = z
  .object({ id: z.guid(), expectedVersion: z.number().int().min(0) })
  .strict();

export const posShortcutSchema = z
  .object({
    productId: z.guid().optional(),
    offerId: z.guid().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.productId) !== Boolean(data.offerId), {
    message: 'Selecione exatamente um produto ou uma oferta.',
  });

export const reorderPosShortcutsSchema = z
  .object({ shortcutIds: z.array(z.guid()).max(24) })
  .strict();

export const deletePosShortcutSchema = z.object({ id: z.guid() }).strict();

export type PosQuoteInput = z.output<typeof posQuoteSchema>;
export type PosOrderInput = z.output<typeof posOrderSchema>;
export type PosDeliveryAddressInput = z.output<typeof posDeliveryAddressSchema>;
export type PosManualDiscountInput = z.output<typeof posManualDiscountSchema>;
export type PosDraftIntentInput = z.output<typeof posDraftIntentSchema>;
export type SavePosDraftInput = z.output<typeof savePosDraftSchema>;
