import { loginSchema, type LoginInput } from '@/schemas/auth';
import { verifyPassword } from '@/server/auth/password';
import {
  generateSessionToken,
  getSessionExpiration,
  setSessionCookie,
  getSessionToken,
  clearSessionCookie,
} from '@/server/auth/session';
import * as userRepo from '@/server/repositories/user.repository';
import * as sessionRepo from '@/server/repositories/session.repository';
import * as memberRepo from '@/server/repositories/tenant-member.repository';
import * as auditRepo from '@/server/repositories/audit-log.repository';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import {
  AuthenticationError,
  RateLimitError,
  ValidationError,
} from '@/server/errors';
import type { SessionContext } from '@/server/auth';

// =============================================================================
// Auth Service
// =============================================================================

/**
 * Mensagem genérica para falhas de login.
 * Impede enumeração de e-mails — mesma mensagem para todos os cenários de erro.
 */
const LOGIN_ERROR_MESSAGE = 'E-mail ou senha incorretos.';

/**
 * Realiza o login de um usuário.
 *
 * Fluxo:
 * 1. Validar entrada com Zod
 * 2. Verificar rate limiting
 * 3. Buscar usuário
 * 4. Verificar senha com Argon2
 * 5. Criar sessão
 * 6. Definir cookie
 * 7. Registrar audit log
 *
 * @returns Dados do usuário autenticado (sem hash de senha)
 */
export async function login(
  input: LoginInput,
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<{
  user: { id: string; email: string; name: string };
  tenantId: string | null;
  storeId: string | null;
  role: string | null;
}> {
  // 1. Validação de entrada
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Dados de login inválidos.',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // 2. Rate limiting por IP e por email
  const rateLimiter = getRateLimiter();
  const identifier = meta?.ipAddress
    ? `login:${meta.ipAddress}:${normalizedEmail}`
    : `login:${normalizedEmail}`;

  const rateResult = await rateLimiter.check({
    identifier,
    ...RATE_LIMITS.login,
  });

  if (!rateResult.allowed) {
    throw new RateLimitError(
      'Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.',
    );
  }

  // 3. Buscar usuário
  const user = await userRepo.findUserByEmail(normalizedEmail);

  if (!user) {
    // Registrar tentativa de login falho sem revelar que o e-mail não existe
    await auditRepo.createAuditLog({
      action: 'LOGIN_FAILED',
      entity: 'User',
      metadata: { reason: 'user_not_found', email: normalizedEmail },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AuthenticationError(LOGIN_ERROR_MESSAGE);
  }

  // 4. Verificar se o usuário está ativo
  if (!user.isActive) {
    await auditRepo.createAuditLog({
      userId: user.id,
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user.id,
      metadata: { reason: 'user_inactive' },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AuthenticationError(LOGIN_ERROR_MESSAGE);
  }

  // 5. Verificar senha
  const passwordValid = await verifyPassword(password, user.passwordHash);

  if (!passwordValid) {
    await auditRepo.createAuditLog({
      userId: user.id,
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user.id,
      metadata: { reason: 'invalid_password' },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AuthenticationError(LOGIN_ERROR_MESSAGE);
  }

  // 6. Resetar rate limiter após login bem-sucedido
  await rateLimiter.reset(identifier);

  // 7. Criar sessão
  const token = generateSessionToken();
  const expiresAt = getSessionExpiration();

  await sessionRepo.createSession({
    userId: user.id,
    token,
    expiresAt,
  });

  // 8. Definir cookie
  await setSessionCookie(token);

  // 9. Carregar contexto de tenant
  const membership = await memberRepo.findFirstActiveMembership(user.id);
  const tenantId = membership?.tenantId ?? null;
  const role = membership?.role ?? null;
  const storeId = membership?.tenant?.stores?.[0]?.id ?? null;

  // 10. Audit log de login bem-sucedido
  await auditRepo.createAuditLog({
    tenantId,
    userId: user.id,
    action: 'LOGIN',
    entity: 'User',
    entityId: user.id,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  return {
    user: { id: user.id, email: user.email, name: user.name },
    tenantId,
    storeId,
    role,
  };
}

/**
 * Realiza o logout — revoga a sessão e remove o cookie.
 */
export async function logout(): Promise<void> {
  const token = await getSessionToken();

  if (token) {
    // Buscar sessão para audit log
    const session = await sessionRepo.findValidSession(token);

    if (session) {
      await auditRepo.createAuditLog({
        userId: session.userId,
        action: 'LOGOUT',
        entity: 'User',
        entityId: session.userId,
      });
    }

    // Revogar sessão
    await sessionRepo.deleteSessionByToken(token);
  }

  // Remover cookie (sempre, mesmo se a sessão não existir)
  await clearSessionCookie();
}

/**
 * Valida a sessão atual e retorna o contexto.
 * Retorna null se não houver sessão válida.
 */
export async function validateCurrentSession(): Promise<SessionContext | null> {
  const token = await getSessionToken();

  if (!token) {
    return null;
  }

  const session = await sessionRepo.findValidSession(token);

  if (!session || !session.user.isActive) {
    return null;
  }

  // Carregar contexto do tenant
  const membership = await memberRepo.findFirstActiveMembership(session.userId);

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: membership?.role ?? 'OWNER', // Default sensato
    tenantId: membership?.tenantId ?? null,
    storeId: membership?.tenant?.stores?.[0]?.id ?? null,
  };
}
