import { z } from 'zod';

const envSchema = z.object({
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

  STORAGE_PROVIDER: z.enum(['local', 'vercel-blob', 'supabase', 's3', 'r2']).default('local'),
  STORAGE_TOKEN: z.string().optional().default(''),

  SUPER_ADMIN_EMAIL: z.string().email(),
  SEED_OWNER_EMAIL: z.string().email().optional(),
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
