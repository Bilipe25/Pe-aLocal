// =============================================================================
// Autenticação — PedidoLocal
// =============================================================================
// Funções centrais de autenticação e autorização.
// Usadas em Server Actions, Route Handlers e Server Components.
// =============================================================================

import { Role, hasPermission, isRoleAtLeast, type Permission } from '@/server/permissions';
import { validateCurrentSession } from '@/server/services/auth.service';
import * as storeRepo from '@/server/repositories/store.repository';
import { AuthenticationError, AuthorizationError, TenantAccessError } from '@/server/errors';

/**
 * Contexto de sessão autenticada.
 */
export interface SessionContext {
  userId: string;
  authUserId: string;
  email: string;
  name: string;
  role: Role | null;
  tenantId: string | null;
  storeId: string | null;
}

/**
 * Contexto de tenant para operações privadas.
 */
export interface TenantContext extends Omit<SessionContext, 'role' | 'tenantId'> {
  role: Role;
  tenantId: string;
}

// =============================================================================
// Funções de autenticação
// =============================================================================

/**
 * Recupera o usuário autenticado da sessão.
 * Lança AuthenticationError se não houver sessão válida.
 *
 * @throws {AuthenticationError}
 */
export async function requireAuthenticatedUser(): Promise<SessionContext> {
  const session = await validateCurrentSession();

  if (!session) {
    throw new AuthenticationError();
  }

  return session;
}

/**
 * Verifica se o usuário é SUPER_ADMIN.
 *
 * @throws {AuthenticationError}
 * @throws {AuthorizationError}
 */
export async function requireSuperAdmin(): Promise<SessionContext> {
  const session = await requireAuthenticatedUser();

  if (session.role !== Role.SUPER_ADMIN) {
    throw new AuthorizationError('Acesso restrito a administradores da plataforma.');
  }

  return session;
}

/**
 * Verifica se o usuário é membro de algum tenant ativo.
 *
 * @throws {AuthenticationError}
 * @throws {TenantAccessError}
 */
export async function requireTenantMember(): Promise<TenantContext> {
  const session = await requireAuthenticatedUser();

  if (!session.tenantId || !session.role) {
    throw new TenantAccessError('Você não está vinculado a nenhum estabelecimento.');
  }

  return session as TenantContext;
}

export async function requirePermission(permission: Permission): Promise<TenantContext> {
  const session = await requireTenantMember();
  if (!hasPermission(session.role, permission)) {
    throw new AuthorizationError('Seu perfil não possui permissão para esta ação.');
  }
  return session;
}

/**
 * Verifica se o usuário tem o role mínimo no tenant.
 *
 * @throws {AuthenticationError}
 * @throws {TenantAccessError}
 * @throws {AuthorizationError}
 */
export async function requireTenantRole(minimumRole: Role): Promise<TenantContext> {
  const session = await requireTenantMember();

  if (!isRoleAtLeast(session.role, minimumRole)) {
    throw new AuthorizationError('Seu perfil não possui permissão para esta ação.');
  }

  return session;
}

/**
 * Verifica se o usuário tem acesso a uma loja específica.
 * Por enquanto, verifica se pertence ao tenant da loja.
 * Futuramente pode ter lógica mais granular.
 *
 * @throws {AuthenticationError}
 * @throws {TenantAccessError}
 */
export async function requireStoreAccess(storeId: string): Promise<TenantContext> {
  const session = await requireTenantMember();

  const store = await storeRepo.findStoreById(storeId, session.tenantId);
  if (!store) {
    throw new TenantAccessError('A loja não pertence ao tenant autenticado.');
  }

  return session;
}

/**
 * Recupera o contexto do tenant atual (sem lançar erro se não existir).
 */
export async function getCurrentTenantContext(): Promise<TenantContext | null> {
  const session = await validateCurrentSession();

  if (!session || !session.tenantId) {
    return null;
  }

  return session as TenantContext;
}
