import { getDb } from '@/server/database/client';

// =============================================================================
// User Repository
// =============================================================================

/**
 * Busca um usuário pelo e-mail.
 * Retorna null se não encontrar (sem revelar se o e-mail existe).
 */
export async function findUserByEmail(email: string) {
  return getDb().user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      authUserId: true,
      email: true,
      name: true,
      platformRole: true,
      isActive: true,
      emailVerified: true,
      createdAt: true,
    },
  });
}

/** Busca o perfil de negócio associado à identidade validada pelo Supabase. */
export async function findUserByAuthUserId(authUserId: string) {
  return getDb().user.findUnique({
    where: { authUserId },
    select: {
      id: true,
      authUserId: true,
      email: true,
      name: true,
      platformRole: true,
      isActive: true,
      emailVerified: true,
      createdAt: true,
    },
  });
}

/**
 * Busca um usuário pelo ID.
 */
export async function findUserById(id: string) {
  return getDb().user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true,
      isActive: true,
      createdAt: true,
    },
  });
}

/**
 * Cria um novo usuário.
 */
export async function createUser(data: { authUserId: string; email: string; name: string }) {
  return getDb().user.create({
    data: {
      authUserId: data.authUserId,
      email: data.email.toLowerCase().trim(),
      name: data.name.trim(),
      platformRole: 'USER',
    },
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true,
      createdAt: true,
    },
  });
}

/**
 * Liga um perfil legado à identidade Supabase após autenticação comprovada.
 * O `updateMany` impede sobrescrever uma associação já existente.
 */
export async function linkAuthIdentity(userId: string, authUserId: string, emailVerified: boolean) {
  return getDb().user.updateMany({
    where: { id: userId, authUserId: null },
    data: { authUserId, emailVerified },
  });
}

/**
 * Verifica se um e-mail já está em uso.
 */
export async function emailExists(email: string): Promise<boolean> {
  const count = await getDb().user.count({
    where: { email: email.toLowerCase().trim() },
  });
  return count > 0;
}
