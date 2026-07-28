import { z } from 'zod';

const POSTGRES_INT_MAX = 2_147_483_647;
const MAX_CURRENCY_REAIS = POSTGRES_INT_MAX / 100;

const formBooleanSchema = z.preprocess(
  (value) => value === true || value === 'true' || value === 'on',
  z.boolean(),
);

const couponCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(3, 'O código deve ter pelo menos 3 caracteres.')
      .max(32, 'O código deve ter no máximo 32 caracteres.')
      .regex(
        /^[A-Z0-9][A-Z0-9_-]*$/,
        'Use somente letras sem acento, números, hífen ou sublinhado.',
      ),
  );

const requiredCurrencySchema = z.coerce
  .number()
  .finite('Informe um valor válido.')
  .min(0.01, 'O valor deve ser maior que zero.')
  .max(MAX_CURRENCY_REAIS, 'O valor informado é muito alto.')
  .transform((value) => Math.round(value * 100));

const optionalCurrencySchema = z
  .union([
    z.literal(''),
    z.null(),
    z.undefined(),
    z.coerce
      .number()
      .finite('Informe um valor válido.')
      .min(0, 'O valor não pode ser negativo.')
      .max(MAX_CURRENCY_REAIS, 'O valor informado é muito alto.'),
  ])
  .transform((value) =>
    value === '' || value === null || value === undefined || value === 0
      ? null
      : Math.round(value * 100),
  );

const optionalUsageLimitSchema = z
  .union([
    z.literal(''),
    z.null(),
    z.undefined(),
    z.coerce
      .number()
      .int('O limite de usos deve ser um número inteiro.')
      .min(1, 'O limite de usos deve ser maior que zero.')
      .max(POSTGRES_INT_MAX),
  ])
  .transform((value) => (value === '' || value === null || value === undefined ? null : value));

const optionalDateSchema = z
  .union([z.iso.datetime({ offset: true }), z.literal(''), z.null(), z.undefined()])
  .transform((value) => (value ? new Date(value) : null));

const commonShape = {
  code: couponCodeSchema,
  minOrderValue: optionalCurrencySchema,
  maxUsages: optionalUsageLimitSchema,
  startsAt: optionalDateSchema,
  expiresAt: optionalDateSchema,
  isActive: formBooleanSchema.default(true),
};

const percentageCouponSchema = z
  .object({
    ...commonShape,
    type: z.literal('PERCENTAGE'),
    value: z.coerce
      .number()
      .int('O percentual deve ser um número inteiro.')
      .min(1, 'O percentual deve ser de pelo menos 1%.')
      .max(100, 'O percentual não pode ultrapassar 100%.'),
    maxDiscount: optionalCurrencySchema,
  })
  .strict();

const fixedCouponSchema = z
  .object({
    ...commonShape,
    type: z.literal('FIXED'),
    value: requiredCurrencySchema,
    maxDiscount: z.union([z.literal(''), z.null(), z.undefined()]).transform(() => null),
  })
  .strict();

export const couponAdminInputSchema = z
  .discriminatedUnion('type', [percentageCouponSchema, fixedCouponSchema])
  .superRefine((coupon, context) => {
    if (coupon.startsAt && coupon.expiresAt && coupon.expiresAt <= coupon.startsAt) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'A data final deve ser posterior à data inicial.',
      });
    }
  });

export const couponIdSchema = z.uuid('O cupom informado é inválido.');

export const couponListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .strict();

export type CouponAdminInput = z.input<typeof couponAdminInputSchema>;
export type ParsedCouponAdminInput = z.output<typeof couponAdminInputSchema>;
