// =============================================================================
// Autenticação — PedidoLocal
// =============================================================================
// Funções centrais de autenticação e autorização.
// Usadas em Server Actions, Route Handlers e Server Components.
// =============================================================================

import {
  PlatformRole,
  hasTenantPermission,
  isTenantRoleAtLeast,
  type Permission,
  type TenantRole,
} from '@/server/permissions';
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
  platformRole: PlatformRole;
  tenantRole: TenantRole | null;
  tenantId: string | null;
  storeId: string | null;
}

/**
 * Contexto de tenant para operações privadas.
 */
export interface TenantContext extends Omit<SessionContext, 'tenantRole' | 'tenantId'> {
  tenantRole: TenantRole;
  tenantId: string;
}

export interface SuperAdminStoreContext {
  session: SessionContext;
  tenantId: string;
  storeId: string;
  store: NonNullable<Awaited<ReturnType<typeof storeRepo.findStoreScopeById>>>;
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

  if (session.platformRole !== PlatformRole.SUPER_ADMIN) {
    throw new AuthorizationError('Acesso restrito a administradores da plataforma.');
  }

  return session;
}

/**
 * Autoriza uma operação de plataforma para uma loja explicitamente selecionada.
 * Os IDs enviados pela rota não são evidência de autorização: a relação entre
 * tenant e loja é sempre confirmada no banco depois da validação do papel.
 */
export async function requireSuperAdminStoreAccess(
  tenantId: string,
  storeId: string,
): Promise<SuperAdminStoreContext> {
  const session = await requireSuperAdmin();

  if (!tenantId || !storeId) {
    throw new TenantAccessError('Tenant e loja são obrigatórios para esta operação.');
  }

  const store = await storeRepo.findStoreScopeById(storeId, tenantId);
  if (!store) {
    throw new TenantAccessError('A loja não pertence ao tenant informado.');
  }

  return { session, tenantId, storeId, store };
}

/**
 * Verifica se o usuário é membro de algum tenant ativo.
 *
 * @throws {AuthenticationError}
 * @throws {TenantAccessError}
 */
export async function requireTenantMember(): Promise<TenantContext> {
  const session = await requireAuthenticatedUser();

  if (!session.tenantId || !session.tenantRole) {
    throw new TenantAccessError('Você não está vinculado a nenhum estabelecimento.');
  }

  return session as TenantContext;
}

export async function requirePermission(permission: Permission): Promise<TenantContext> {
  const session = await requireTenantMember();
  if (!hasTenantPermission(session.tenantRole, permission)) {
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
export async function requireTenantRole(minimumRole: TenantRole): Promise<TenantContext> {
  const session = await requireTenantMember();

  if (!isTenantRoleAtLeast(session.tenantRole, minimumRole)) {
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

  if (!session || !session.tenantId || !session.tenantRole) {
    return null;
  }

  return session as TenantContext;
}
