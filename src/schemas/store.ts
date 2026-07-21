import { z } from 'zod';
import {
  normalizePhone,
  normalizePixKey,
  normalizeState,
  normalizeZipCode,
  validateBrazilianPhone,
  validateBrazilianState,
  validatePixKey,
  type PixKeyKind,
} from '@/lib/brazil';

// =============================================================================
// Schemas de Loja
// =============================================================================

const RESERVED_SLUGS = [
  'login',
  'register',
  'dashboard',
  'admin',
  'api',
  'health',
  'about',
  'terms',
  'privacy',
  'support',
  'help',
  'pricing',
  'blog',
  'docs',
  'app',
  'settings',
  'account',
  'checkout',
  'cart',
  'order',
  'orders',
  'payment',
  'payments',
  'webhook',
  'webhooks',
  'public',
  'static',
  'assets',
  'images',
  'uploads',
  '_next',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
];

export const slugSchema = z
  .string()
  .min(3, 'Slug deve ter pelo menos 3 caracteres.')
  .max(60, 'Slug muito longo.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug deve conter apenas letras minúsculas, números e hífens.',
  )
  .refine((val) => !RESERVED_SLUGS.includes(val), 'Este slug é reservado.');

export const updateStoreSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(100),
  slug: slugSchema,
  description: z.string().trim().max(500, 'Descrição muito longa.').optional().default(''),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine(
      (value) => !value || validateBrazilianPhone(value),
      'Informe um telefone brasileiro válido.',
    )
    .transform((value) => (value ? normalizePhone(value) : ''))
    .optional()
    .default(''),
  whatsapp: z
    .string()
    .trim()
    .max(20)
    .refine(
      (value) => !value || validateBrazilianPhone(value),
      'Informe um WhatsApp brasileiro válido.',
    )
    .transform((value) => (value ? normalizePhone(value) : ''))
    .optional()
    .default(''),
  status: z.enum(['OPEN', 'CLOSED', 'PAUSED']).optional(),
});

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export const expectedConfigurationVersionSchema = z.coerce
  .number()
  .int('A versão da configuração deve ser um número inteiro.')
  .nonnegative('A versão da configuração é inválida.');

const formBooleanSchema = z.preprocess(
  (value) => value === true || value === 'true' || value === 'on' || value === 1 || value === '1',
  z.boolean(),
);

export const updateStoreSettingsSchema = z
  .object({
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.')
      .optional(),
    secondaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.')
      .optional(),
    minOrderValue: z.coerce
      .number()
      .min(0, 'O pedido mínimo não pode ser negativo.')
      .max(10_000, 'O pedido mínimo deve ser de até R$ 10.000,00.')
      .default(0),
    estimatedTimeMinMinutes: z.coerce
      .number()
      .int('Informe o prazo mínimo em minutos inteiros.')
      .min(1, 'O prazo mínimo deve ser maior que zero.')
      .max(1440, 'O prazo mínimo deve ser de até 1440 minutos.'),
    estimatedTimeMaxMinutes: z.coerce
      .number()
      .int('Informe o prazo máximo em minutos inteiros.')
      .min(1, 'O prazo máximo deve ser maior que zero.')
      .max(1440, 'O prazo máximo deve ser de até 1440 minutos.'),
    deliveryEnabled: formBooleanSchema.default(true),
    pickupEnabled: formBooleanSchema.default(true),
    acceptsPix: formBooleanSchema.default(true),
    acceptsCash: formBooleanSchema.default(true),
    acceptsCardOnDelivery: formBooleanSchema.default(true),
  })
  .superRefine((settings, context) => {
    if (settings.estimatedTimeMaxMinutes < settings.estimatedTimeMinMinutes) {
      context.addIssue({
        code: 'custom',
        path: ['estimatedTimeMaxMinutes'],
        message: 'O prazo máximo precisa ser maior ou igual ao mínimo.',
      });
    }
    if (!settings.deliveryEnabled && !settings.pickupEnabled) {
      context.addIssue({
        code: 'custom',
        path: ['deliveryEnabled'],
        message: 'Mantenha entrega ou retirada habilitada.',
      });
    }
    if (!settings.acceptsPix && !settings.acceptsCash && !settings.acceptsCardOnDelivery) {
      context.addIssue({
        code: 'custom',
        path: ['acceptsPix'],
        message: 'Mantenha ao menos uma forma de pagamento habilitada.',
      });
    }
  });

export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;

export const updatePixConfigSchema = z
  .object({
    pixKeyType: z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM']).nullable().optional(),
    pixKey: z.string().trim().max(100).optional().default(''),
    pixRecipient: z.string().trim().max(100).optional().default(''),
    pixBank: z.string().trim().max(60).optional().default(''),
    pixInstructions: z.string().trim().max(300).optional().default(''),
  })
  .superRefine((settings, context) => {
    if (!settings.pixKeyType && settings.pixKey) {
      context.addIssue({
        code: 'custom',
        path: ['pixKeyType'],
        message: 'Selecione o tipo da chave Pix.',
      });
    }
    if (settings.pixKeyType && !settings.pixKey) {
      context.addIssue({ code: 'custom', path: ['pixKey'], message: 'Informe a chave Pix.' });
    }
    if (
      settings.pixKeyType &&
      settings.pixKey &&
      !validatePixKey(settings.pixKeyType, settings.pixKey)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['pixKey'],
        message: `A chave ${settings.pixKeyType} é inválida.`,
      });
    }
    if (settings.pixKeyType && settings.pixRecipient.length < 2) {
      context.addIssue({
        code: 'custom',
        path: ['pixRecipient'],
        message: 'Informe o nome do beneficiário.',
      });
    }
  })
  .transform((settings) => ({
    ...settings,
    pixKey: settings.pixKeyType
      ? normalizePixKey(settings.pixKeyType as PixKeyKind, settings.pixKey)
      : '',
  }));

export type UpdatePixConfigInput = z.infer<typeof updatePixConfigSchema>;

export const updateAddressSchema = z.object({
  street: z.string().min(2, 'Rua é obrigatória.').max(200),
  number: z.string().min(1, 'Número é obrigatório.').max(20),
  complement: z.string().max(100).optional().default(''),
  neighborhood: z.string().min(2, 'Bairro é obrigatório.').max(100),
  city: z.string().min(2, 'Cidade é obrigatória.').max(100),
  state: z
    .string()
    .transform(normalizeState)
    .refine(validateBrazilianState, 'Selecione uma UF brasileira válida.'),
  zipCode: z
    .string()
    .transform(normalizeZipCode)
    .refine((value) => /^\d{8}$/.test(value), 'Informe um CEP com oito dígitos.'),
});

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

const DAY_OF_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export const APPROVED_STORE_TIME_ZONES = [
  'America/Noronha',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Maceio',
  'America/Bahia',
  'America/Sao_Paulo',
  'America/Campo_Grande',
  'America/Cuiaba',
  'America/Manaus',
  'America/Boa_Vista',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Eirunepe',
] as const;

export const DEFAULT_STORE_TIME_ZONE = 'America/Fortaleza' as const;

export const storeTimeZoneSchema = z.enum(APPROVED_STORE_TIME_ZONES, {
  error: 'Selecione um fuso horário válido.',
});

function isRealDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Informe uma hora real entre 00:00 e 23:59.');

const hourEntrySchema = z
  .object({
    dayOfWeek: z.enum(DAY_OF_WEEK),
    openTime: timeSchema,
    closeTime: timeSchema,
    isActive: z.coerce.boolean().default(true),
  })
  .superRefine((hour, context) => {
    if (hour.isActive && hour.openTime === hour.closeTime) {
      context.addIssue({
        code: 'custom',
        path: ['closeTime'],
        message: 'Abertura e fechamento precisam ser diferentes.',
      });
    }
  });

export const updateHoursSchema = z.object({
  timeZone: storeTimeZoneSchema,
  hours: z
    .array(hourEntrySchema)
    .min(1)
    .max(7)
    .superRefine((hours, context) => {
      const days = new Set(hours.map((hour) => hour.dayOfWeek));
      if (days.size !== hours.length) {
        context.addIssue({
          code: 'custom',
          message: 'Cada dia da semana pode aparecer somente uma vez.',
        });
      }
    }),
});

export const createScheduleExceptionSchema = z
  .object({
    date: z
      .string()
      .refine(isRealDate, 'Informe uma data válida.')
      .refine(
        (value) => value >= '2000-01-01' && value <= '2100-12-31',
        'A data está fora do intervalo permitido.',
      ),
    type: z.enum(['CLOSED', 'CUSTOM_HOURS']),
    openTime: z.string().optional().default(''),
    closeTime: z.string().optional().default(''),
    reason: z
      .string()
      .trim()
      .max(200, 'O motivo deve ter no máximo 200 caracteres.')
      .optional()
      .default(''),
  })
  .superRefine((exception, context) => {
    if (exception.type === 'CLOSED') return;

    const openTime = timeSchema.safeParse(exception.openTime);
    const closeTime = timeSchema.safeParse(exception.closeTime);
    if (!openTime.success) {
      context.addIssue({
        code: 'custom',
        path: ['openTime'],
        message: openTime.error.issues[0].message,
      });
    }
    if (!closeTime.success) {
      context.addIssue({
        code: 'custom',
        path: ['closeTime'],
        message: closeTime.error.issues[0].message,
      });
    }
    if (openTime.success && closeTime.success && exception.openTime === exception.closeTime) {
      context.addIssue({
        code: 'custom',
        path: ['closeTime'],
        message: 'Abertura e fechamento precisam ser diferentes.',
      });
    }
  });

export type UpdateHoursInput = z.infer<typeof updateHoursSchema>;
export type HourEntry = z.infer<typeof hourEntrySchema>;
export type CreateScheduleExceptionInput = z.infer<typeof createScheduleExceptionSchema>;
