import { z } from 'zod';

// =============================================================================
// Schemas de Autenticação
// =============================================================================

/**
 * Schema de login.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'E-mail é obrigatório.')
    .email('E-mail inválido.'),
  password: z
    .string()
    .min(1, 'Senha é obrigatória.')
    .min(8, 'Senha deve ter pelo menos 8 caracteres.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Schema de registro de usuário (uso interno / seed).
 */
export const createUserSchema = z.object({
  email: z
    .string()
    .min(1, 'E-mail é obrigatório.')
    .email('E-mail inválido.'),
  name: z
    .string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres.')
    .max(100, 'Nome muito longo.'),
  password: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres.')
    .max(128, 'Senha muito longa.'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
