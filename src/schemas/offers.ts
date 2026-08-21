import { z } from 'zod';

const POSTGRES_INT_MAX = 2_147_483_647;
const MAX_CURRENCY_REAIS = POSTGRES_INT_MAX / 100;
const MAX_COMBO_COMPONENT_UNITS = 250;

export const offerDayOfWeekSchema = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

const formBooleanSchema = z.preprocess(
  (value) => value === true || value === 'true' || value === 'on',
  z.boolean(),
);

const currencyReaisSchema = z.coerce
  .number()
  .finite('Informe um valor válido.')
  .min(0.01, 'O valor deve ser maior que zero.')
  .max(MAX_CURRENCY_REAIS, 'O valor informado é muito alto.')
  .transform((value) => Math.round(value * 100));

const optionalLocalDateSchema = z
  .union([z.iso.date(), z.literal(''), z.null(), z.undefined()])
  .transform((value) => value || null);

const optionalLocalTimeSchema = z
  .union([
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário válido no formato HH:mm.'),
    z.literal(''),
    z.null(),
    z.undefined(),
  ])
  .transform((value) => {
    if (!value) return null;
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  });

const scheduleShape = {
  startsOn: optionalLocalDateSchema,
  endsOnExclusive: optionalLocalDateSchema,
  weekdays: z.array(offerDayOfWeekSchema).max(7).default([]),
  startTime: optionalLocalTimeSchema,
  endTimeExclusive: optionalLocalTimeSchema,
};

function validateSchedule(
  value: {
    startsOn: string | null;
    endsOnExclusive: string | null;
    weekdays: string[];
    startTime: number | null;
    endTimeExclusive: number | null;
  },
  context: z.RefinementCtx,
) {
  if (value.startsOn && value.endsOnExclusive && value.startsOn >= value.endsOnExclusive) {
    context.addIssue({
      code: 'custom',
      path: ['endsOnExclusive'],
      message: 'A data final deve ser posterior à data inicial.',
    });
  }
  if ((value.startTime == null) !== (value.endTimeExclusive == null)) {
    context.addIssue({
      code: 'custom',
      path: value.startTime == null ? ['startTime'] : ['endTimeExclusive'],
      message: 'Informe o início e o fim da janela de horário.',
    });
  }
  if (value.startTime != null && value.startTime === value.endTimeExclusive) {
    context.addIssue({
      code: 'custom',
      path: ['endTimeExclusive'],
      message: 'O horário final deve ser diferente do inicial.',
    });
  }
  if (new Set(value.weekdays).size !== value.weekdays.length) {
    context.addIssue({
      code: 'custom',
      path: ['weekdays'],
      message: 'Não repita dias da semana.',
    });
  }
}

const comboItemSchema = z
  .object({
    // O catálogo possui IDs GUID legados que são válidos no PostgreSQL, mas
    // não carregam os bits RFC exigidos por z.uuid().
    productId: z.guid('Selecione um produto válido.'),
    quantity: z.coerce
      .number()
      .int('A quantidade deve ser inteira.')
      .min(1, 'A quantidade deve ser maior que zero.')
      .max(999, 'A quantidade por componente é muito alta.'),
  })
  .strict();

export const comboAdminInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome do combo.').max(120),
    description: z
      .union([z.string().trim().max(500), z.null(), z.undefined()])
      .transform((value) => value || null),
    specialPrice: currencyReaisSchema,
    isActive: formBooleanSchema.default(true),
    sortOrder: z.coerce.number().int().min(0).max(POSTGRES_INT_MAX).default(0),
    items: z.array(comboItemSchema).min(2, 'Adicione pelo menos dois produtos.').max(50),
    ...scheduleShape,
  })
  .strict()
  .superRefine((value, context) => {
    validateSchedule(value, context);
    if (new Set(value.items.map((item) => item.productId)).size !== value.items.length) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Cada produto deve aparecer uma única vez no combo; ajuste a quantidade.',
      });
    }
    if (value.items.reduce((total, item) => total + item.quantity, 0) > MAX_COMBO_COMPONENT_UNITS) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: `O combo deve ter no máximo ${MAX_COMBO_COMPONENT_UNITS} unidades em sua composição.`,
      });
    }
  });

export const productPromotionAdminInputSchema = z
  .object({
    productId: z.guid('Selecione um produto válido.'),
    promotionalPrice: currencyReaisSchema,
    isActive: formBooleanSchema.default(true),
    ...scheduleShape,
  })
  .strict()
  .superRefine(validateSchedule);

export const canonicalOfferKindSchema = z.enum([
  'COMBO_FLEXIBLE',
  'PRODUCT_FIXED_PRICE',
  'QUANTITY_FIXED_PRICE',
  'BOGO',
  'CART_FIXED_DISCOUNT',
  'FREE_DELIVERY',
]);

const optionalCurrencyReaisSchema = z
  .preprocess(
    (value) => (value === '' || value == null ? null : value),
    z.union([z.null(), z.coerce.number().finite().min(0).max(MAX_CURRENCY_REAIS)]),
  )
  .transform((value) => (value == null ? null : Math.round(value * 100)));

const flexibleComboChoiceSchema = z
  .object({
    productId: z.guid('Selecione um produto válido.'),
    priceDelta: optionalCurrencyReaisSchema.transform((value) => value ?? 0),
  })
  .strict();

const flexibleComboGroupSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome do grupo.').max(80),
    quantity: z.coerce.number().int().min(1).max(99).default(1),
    choices: z.array(flexibleComboChoiceSchema).min(1).max(20),
  })
  .strict()
  .refine(
    (group) =>
      new Set(group.choices.map((choice) => choice.productId)).size === group.choices.length,
    {
      path: ['choices'],
      message: 'Não repita o mesmo produto dentro do grupo.',
    },
  );

export const canonicalOfferAdminInputSchema = z
  .object({
    kind: canonicalOfferKindSchema,
    name: z.string().trim().min(1, 'Informe o nome da oferta.').max(120),
    description: z
      .union([z.string().trim().max(500), z.null(), z.undefined()])
      .transform((value) => value || null),
    isActive: formBooleanSchema.default(true),
    modalities: z
      .array(z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']))
      .max(3)
      .default([])
      .refine((value) => new Set(value).size === value.length, 'Não repita modalidades.'),
    productId: z.preprocess(
      (value) => (value === '' || value == null ? null : value),
      z.union([z.guid(), z.null()]),
    ),
    fixedPrice: optionalCurrencyReaisSchema,
    requiredQuantity: z.coerce.number().int().min(2).max(99).optional(),
    buyQuantity: z.coerce.number().int().min(1).max(99).optional(),
    getQuantity: z.coerce.number().int().min(1).max(99).optional(),
    discountValue: optionalCurrencyReaisSchema,
    minSubtotal: optionalCurrencyReaisSchema,
    maxApplicationsPerOrder: z.coerce.number().int().min(1).max(99).default(1),
    maxTotalUses: z.coerce.number().int().min(1).max(POSTGRES_INT_MAX).nullable().optional(),
    maxUsesPerCustomer: z.coerce.number().int().min(1).max(POSTGRES_INT_MAX).nullable().optional(),
    groups: z.array(flexibleComboGroupSchema).min(2).max(20).optional(),
    ...scheduleShape,
  })
  .strict()
  .superRefine((value, context) => {
    validateSchedule(value, context);
    const productKind = ['PRODUCT_FIXED_PRICE', 'QUANTITY_FIXED_PRICE', 'BOGO'].includes(
      value.kind,
    );
    if (productKind && !value.productId) {
      context.addIssue({ code: 'custom', path: ['productId'], message: 'Selecione um produto.' });
    }
    if (
      (value.kind === 'PRODUCT_FIXED_PRICE' || value.kind === 'QUANTITY_FIXED_PRICE') &&
      (!value.fixedPrice || value.fixedPrice <= 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['fixedPrice'],
        message: 'Informe o preço promocional.',
      });
    }
    if (value.kind === 'QUANTITY_FIXED_PRICE' && !value.requiredQuantity) {
      context.addIssue({
        code: 'custom',
        path: ['requiredQuantity'],
        message: 'Informe a quantidade do grupo.',
      });
    }
    if (value.kind === 'BOGO' && (!value.buyQuantity || !value.getQuantity)) {
      context.addIssue({
        code: 'custom',
        path: ['buyQuantity'],
        message: 'Informe as quantidades da oferta.',
      });
    }
    if (
      value.kind === 'CART_FIXED_DISCOUNT' &&
      (!value.discountValue || value.discountValue <= 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'Informe o desconto do carrinho.',
      });
    }
    if (value.kind === 'COMBO_FLEXIBLE') {
      if (!value.fixedPrice || value.fixedPrice <= 0) {
        context.addIssue({
          code: 'custom',
          path: ['fixedPrice'],
          message: 'Informe o preço do combo.',
        });
      }
      if (!value.groups || value.groups.length < 2) {
        context.addIssue({
          code: 'custom',
          path: ['groups'],
          message: 'Adicione pelo menos dois grupos.',
        });
      } else if (
        value.groups.reduce((total, group) => total + group.quantity, 0) > MAX_COMBO_COMPONENT_UNITS
      ) {
        context.addIssue({
          code: 'custom',
          path: ['groups'],
          message: 'A composição excede 250 unidades.',
        });
      }
    }
  });

export const offerIdSchema = z.uuid('A oferta informada é inválida.');
export const offerVersionSchema = z.coerce.number().int().min(0);
export const offerListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    kind: z.enum(['ALL', 'COMBO', 'PRODUCT_PROMOTION']).default('ALL'),
    status: z.enum(['ALL', 'ACTIVE', 'PAUSED', 'ARCHIVED']).default('ALL'),
  })
  .strict();

export type ComboAdminInput = z.input<typeof comboAdminInputSchema>;
export type ParsedComboAdminInput = z.output<typeof comboAdminInputSchema>;
export type ProductPromotionAdminInput = z.input<typeof productPromotionAdminInputSchema>;
export type ParsedProductPromotionAdminInput = z.output<typeof productPromotionAdminInputSchema>;
export type CanonicalOfferAdminInput = z.input<typeof canonicalOfferAdminInputSchema>;
export type ParsedCanonicalOfferAdminInput = z.output<typeof canonicalOfferAdminInputSchema>;
