import { z } from 'zod';

// =============================================================================
// Schemas de Loja
// =============================================================================

const RESERVED_SLUGS = [
  'login', 'register', 'dashboard', 'admin', 'api', 'health',
  'about', 'terms', 'privacy', 'support', 'help', 'pricing',
  'blog', 'docs', 'app', 'settings', 'account', 'checkout',
  'cart', 'order', 'orders', 'payment', 'payments', 'webhook',
  'webhooks', 'public', 'static', 'assets', 'images', 'uploads',
  '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml',
];

export const slugSchema = z
  .string()
  .min(3, 'Slug deve ter pelo menos 3 caracteres.')
  .max(60, 'Slug muito longo.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug deve conter apenas letras minúsculas, números e hífens.')
  .refine((val) => !RESERVED_SLUGS.includes(val), 'Este slug é reservado.');

export const updateStoreSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(100),
  slug: slugSchema,
  description: z.string().max(500, 'Descrição muito longa.').optional().default(''),
  phone: z.string().max(20).optional().default(''),
  whatsapp: z.string().max(20).optional().default(''),
  status: z.enum(['OPEN', 'CLOSED', 'PAUSED']).optional(),
});

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export const expectedConfigurationVersionSchema = z.coerce
  .number()
  .int('A versão da configuração deve ser um número inteiro.')
  .nonnegative('A versão da configuração é inválida.');

export const updateStoreSettingsSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.').optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.').optional(),
  minOrderValue: z.coerce.number().min(0, 'Valor mínimo não pode ser negativo.').default(0),
  estimatedTime: z.string().max(30).optional().default('30-50 min'),
  deliveryEnabled: z.coerce.boolean().default(true),
  pickupEnabled: z.coerce.boolean().default(true),
  acceptsPix: z.coerce.boolean().default(true),
  acceptsCash: z.coerce.boolean().default(true),
  acceptsCardOnDelivery: z.coerce.boolean().default(true),
});

export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;

export const updatePixConfigSchema = z.object({
  pixKeyType: z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM']).nullable().optional(),
  pixKey: z.string().max(100).optional().default(''),
  pixRecipient: z.string().max(100).optional().default(''),
  pixBank: z.string().max(60).optional().default(''),
  pixInstructions: z.string().max(300).optional().default(''),
});

export type UpdatePixConfigInput = z.infer<typeof updatePixConfigSchema>;

export const updateAddressSchema = z.object({
  street: z.string().min(2, 'Rua é obrigatória.').max(200),
  number: z.string().min(1, 'Número é obrigatório.').max(20),
  complement: z.string().max(100).optional().default(''),
  neighborhood: z.string().min(2, 'Bairro é obrigatório.').max(100),
  city: z.string().min(2, 'Cidade é obrigatória.').max(100),
  state: z.string().length(2, 'Estado deve ter 2 letras.'),
  zipCode: z.string().min(8, 'CEP inválido.').max(10),
});

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

const DAY_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

const hourEntrySchema = z.object({
  dayOfWeek: z.enum(DAY_OF_WEEK),
  openTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido. Use HH:MM.'),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido. Use HH:MM.'),
  isActive: z.coerce.boolean().default(true),
});

export const updateHoursSchema = z.object({
  hours: z.array(hourEntrySchema).min(1).max(7),
});

export type UpdateHoursInput = z.infer<typeof updateHoursSchema>;
export type HourEntry = z.infer<typeof hourEntrySchema>;
