import { z } from 'zod';

export const BANNER_DESTINATION_TYPES = [
  'NONE',
  'CATEGORY',
  'PRODUCT',
  'COUPON',
  'INTERNAL_PATH',
] as const;

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[<>]/.test(value), 'Não use HTML nos textos.');

const optionalText = (max: number) =>
  z
    .union([safeText(max), z.null()])
    .transform((value) => (value && value.length > 0 ? value : null));

const optionalDate = z
  .union([z.iso.datetime({ offset: true }), z.literal(''), z.null()])
  .transform((value) => (value ? new Date(value) : null));

export const storeBannerInputSchema = z
  .object({
    id: z.uuid().optional(),
    assetId: z.uuid().nullable(),
    title: safeText(120).pipe(z.string().min(1, 'Informe o título do banner.')),
    subtitle: optionalText(240),
    buttonText: optionalText(80),
    destinationType: z.enum(BANNER_DESTINATION_TYPES),
    destinationValue: optionalText(500),
    startsAt: optionalDate,
    endsAt: optionalDate,
    isActive: z.boolean(),
    priority: z.coerce.number().int().min(0).max(1000),
  })
  .strict()
  .superRefine((banner, context) => {
    if (banner.startsAt && banner.endsAt && banner.endsAt <= banner.startsAt) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'A data final deve ser posterior à data inicial.',
      });
    }
    if (banner.destinationType === 'NONE' && banner.destinationValue !== null) {
      context.addIssue({
        code: 'custom',
        path: ['destinationValue'],
        message: 'Banner sem destino não deve possuir valor de destino.',
      });
    }
    if (banner.destinationType !== 'NONE' && banner.destinationValue === null) {
      context.addIssue({
        code: 'custom',
        path: ['destinationValue'],
        message: 'Informe o destino do banner.',
      });
    }
    if (banner.destinationType === 'NONE' && banner.buttonText !== null) {
      context.addIssue({
        code: 'custom',
        path: ['buttonText'],
        message: 'Botões exigem um destino seguro.',
      });
    }
  });

export const storeBannerDeleteSchema = z.object({ bannerId: z.uuid() }).strict();

export type StoreBannerInput = z.input<typeof storeBannerInputSchema>;
export type ParsedStoreBannerInput = z.output<typeof storeBannerInputSchema>;
export type BannerDestinationTypeValue = (typeof BANNER_DESTINATION_TYPES)[number];
