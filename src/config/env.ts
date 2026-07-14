import { z } from 'zod';

/**
 * Schema de validação para variáveis de ambiente.
 * Todas as variáveis obrigatórias devem ser definidas aqui.
 * A validação ocorre na inicialização — falha rápida se algo estiver faltando.
 */
const envSchema = z.object({
  // Banco de Dados
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL é obrigatória'),

  // Autenticação
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET deve ter pelo menos 32 caracteres'),

  // Aplicação
  APP_URL: z.string().url('APP_URL deve ser uma URL válida'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Storage
  STORAGE_PROVIDER: z
    .enum(['local', 'vercel-blob', 'supabase', 's3', 'r2'])
    .default('local'),
  STORAGE_TOKEN: z.string().optional().default(''),

  // Super Admin
  SUPER_ADMIN_EMAIL: z.string().email('SUPER_ADMIN_EMAIL deve ser um e-mail válido'),

  // Seed (opcional, apenas desenvolvimento)
  SEED_OWNER_EMAIL: z.string().email().optional(),
  SEED_OWNER_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Variáveis de ambiente validadas.
 * Acessar `env.DATABASE_URL` ao invés de `process.env.DATABASE_URL`.
 *
 * A validação ocorre apenas uma vez (lazy singleton).
 * Em caso de erro, a aplicação falha imediatamente com mensagem clara.
 */
function createEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ❌ ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `\n\n🚨 Variáveis de ambiente inválidas:\n${formatted}\n\nVerifique o arquivo .env.local\n`,
    );
  }

  return result.data;
}

// Singleton lazy — validação ocorre no primeiro acesso
let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    _env = createEnv();
  }
  return _env;
}

/**
 * Atalho para verificar se estamos em produção.
 */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

/**
 * Atalho para verificar se estamos em desenvolvimento.
 */
export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}
