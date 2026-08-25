import 'server-only';

import { z } from 'zod';

const optionalBirdApiKeySchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .regex(
      /^bk_[a-z]{2}[0-9]+_[A-Za-z0-9]{20,}$/u,
      'deve ser uma API key Bird regional no formato bk_{região}_...',
    )
    .optional(),
);

const envSchema = z
  .object({
    // Prisma CLI e fallback exclusivo do runtime Node local.
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),

    // Supabase Auth. A secret key nunca recebe prefixo NEXT_PUBLIC_.
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().startsWith('sb_secret_').optional(),

    APP_URL: z.string().url(),
    APP_ENV: z.enum(['development', 'staging', 'production']).optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    CONSUMER_VERIFICATION_PROVIDER: z.enum(['disabled', 'development', 'bird']).default('disabled'),
    BIRD_API_KEY: optionalBirdApiKeySchema,

    STORAGE_PROVIDER: z.enum(['local', 'vercel-blob', 'supabase', 's3', 'r2']).default('local'),
    STORAGE_TOKEN: z.string().optional().default(''),

    SEED_OWNER_EMAIL: z.string().email().optional(),
  })
  .superRefine((env, context) => {
    if (env.CONSUMER_VERIFICATION_PROVIDER === 'bird' && !env.BIRD_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['BIRD_API_KEY'],
        message: 'é obrigatória quando CONSUMER_VERIFICATION_PROVIDER=bird',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | undefined;

export function getEnv(): Env {
  if (validatedEnv) return validatedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${formatted}`);
  }

  validatedEnv = result.data;
  return validatedEnv;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}
