import { z } from 'zod';

import { MAX_DELIVERY_MONEY_REAIS } from '@/domain/delivery/constants';

const formBooleanSchema = z.preprocess(
  (value) => value === true || value === 'true' || value === 'on',
  z.boolean(),
);

const postalCodeSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{8}$/, 'Informe um CEP com 8 números.'));

const MAX_ESTIMATED_TIME_MINUTES = 1440;
const estimatedTimePattern = /^([1-9]\d{0,3})(?:\s*[-\u2013]\s*([1-9]\d{0,3}))?\s*min(?:uto)?s?$/i;

const estimatedTimeSchema = z
  .string()
  .trim()
  .max(30)
  .optional()
  .default('')
  .superRefine((value, context) => {
    if (!value) return;

    const match = estimatedTimePattern.exec(value);
    if (!match) {
      context.addIssue({
        code: 'custom',
        message: 'Informe o prazo em minutos, por exemplo: 30–40 min.',
      });
      return;
    }

    const min = Number(match[1]);
    const max = Number(match[2] ?? match[1]);
    if (min > MAX_ESTIMATED_TIME_MINUTES || max > MAX_ESTIMATED_TIME_MINUTES) {
      context.addIssue({
        code: 'custom',
        message: 'O prazo estimado deve ser de até 1440 minutos.',
      });
    } else if (max < min) {
      context.addIssue({
        code: 'custom',
        message: 'O prazo máximo precisa ser maior ou igual ao mínimo.',
      });
    }
  })
  .transform((value) => value || null);

export const deliveryPostalRangeSchema = z
  .object({
    id: z.uuid().optional(),
    postalCodeStart: postalCodeSchema,
    postalCodeEnd: postalCodeSchema,
  })
  .strict()
  .refine((range) => range.postalCodeStart <= range.postalCodeEnd, {
    path: ['postalCodeEnd'],
    message: 'O CEP final deve ser igual ou posterior ao CEP inicial.',
  });

export const createDeliveryZoneSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(80),
    fee: z.coerce
      .number()
      .finite()
      .min(0, 'Taxa não pode ser negativa.')
      .max(MAX_DELIVERY_MONEY_REAIS, 'A taxa informada excede o limite permitido.')
      .default(0),
    minOrderValue: z
      .union([
        z.literal(''),
        z.coerce
          .number()
          .finite()
          .min(0, 'Pedido mínimo não pode ser negativo.')
          .max(MAX_DELIVERY_MONEY_REAIS, 'O pedido mínimo excede o limite permitido.'),
      ])
      .optional()
      .transform((value) => (value === '' || value === undefined ? null : value)),
    estimatedTime: estimatedTimeSchema,
    isActive: formBooleanSchema.default(true),
    sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
    postalRanges: z
      .array(deliveryPostalRangeSchema)
      .min(1, 'Cadastre ao menos uma faixa de CEP.')
      .max(50, 'Cada zona pode ter no máximo 50 faixas de CEP.'),
  })
  .strict()
  .superRefine((data, ctx) => {
    const sorted = [...data.postalRanges].sort((left, right) =>
      left.postalCodeStart.localeCompare(right.postalCodeStart),
    );
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].postalCodeStart <= sorted[index - 1].postalCodeEnd) {
        ctx.addIssue({
          code: 'custom',
          path: ['postalRanges'],
          message: 'As faixas de CEP desta zona não podem se sobrepor.',
        });
        break;
      }
    }
  });

export const updateDeliveryZoneSchema = createDeliveryZoneSchema;

export const deliveryZoneVersionSchema = z.iso.datetime({ offset: true });

export type DeliveryPostalRangeInput = z.infer<typeof deliveryPostalRangeSchema>;
export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;
