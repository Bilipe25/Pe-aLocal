import { loginSchema, type LoginInput } from '@/schemas/auth';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import * as userRepo from '@/server/repositories/user.repository';
import * as memberRepo from '@/server/repositories/tenant-member.repository';
import * as auditRepo from '@/server/repositories/audit-log.repository';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { AuthenticationError, RateLimitError, ValidationError } from '@/server/errors';
import type { SessionContext } from '@/server/auth';
import { PlatformRole, type TenantRole } from '@/server/permissions';

const LOGIN_ERROR_MESSAGE = 'E-mail ou senha incorretos.';

function safeInternalPath(value?: string | null): string | null {
  if (!value || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;

  try {
    const parsed = new URL(value, 'https://pedidolocal.internal');
    if (parsed.origin !== 'https://pedidolocal.internal') return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function resolvePostLoginDestination(
  context: {
    platformRole: PlatformRole;
    tenantId: string | null;
  },
  requestedRedirect?: string | null,
): string {
  const safeRedirect = safeInternalPath(requestedRedirect);

  if (context.platformRole === PlatformRole.SUPER_ADMIN) {
    return safeRedirect === '/admin' || safeRedirect?.startsWith('/admin/')
      ? safeRedirect
      : '/admin';
  }

  if (context.tenantId) {
    return safeRedirect === '/dashboard' || safeRedirect?.startsWith('/dashboard/')
      ? safeRedirect
      : '/dashboard';
  }

  return '/access-pending';
}

async function resolveProfile(authUser: {
  id: string;
  email?: string;
  email_confirmed_at?: string;
}) {
  let profile = await userRepo.findUserByAuthUserId(authUser.id);
  if (profile || !authUser.email) return profile;

  const legacyProfile = await userRepo.findUserByEmail(authUser.email);
  if (!legacyProfile || legacyProfile.authUserId) return null;

  await userRepo.linkAuthIdentity(
    legacyProfile.id,
    authUser.id,
    Boolean(authUser.email_confirmed_at),
  );
  profile = await userRepo.findUserByAuthUserId(authUser.id);
  return profile;
}

async function resolveTenantContext(profile: { id: string; platformRole: PlatformRole }) {
  if (profile.platformRole === PlatformRole.SUPER_ADMIN) {
    return { tenantRole: null, tenantId: null, storeId: null };
  }

  const membership = await memberRepo.findFirstActiveMembership(profile.id);
  return {
    tenantRole: membership?.role ?? null,
    tenantId: membership?.tenantId ?? null,
    // A unidade ativa é resolvida separadamente e sempre revalidada no servidor.
    storeId: null,
  };
}

export async function login(
  input: LoginInput,
  meta?: { ipAddress?: string; userAgent?: string; redirectTo?: string | null },
): Promise<{
  user: { id: string; email: string; name: string };
  platformRole: PlatformRole;
  tenantRole: TenantRole | null;
  tenantId: string | null;
  storeId: string | null;
  destination: string;
}> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Dados de login inválidos.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const identifier = meta?.ipAddress
    ? `login:${meta.ipAddress}:${normalizedEmail}`
    : `login:${normalizedEmail}`;
  const rateLimiter = getRateLimiter();
  const rateResult = await rateLimiter.check({
    identifier,
    ...RATE_LIMITS.login,
  });

  if (!rateResult.allowed) {
    throw new RateLimitError('Muitas tentativas de login. Aguarde antes de tentar novamente.');
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    await auditRepo.createAuditLog({
      action: 'LOGIN_FAILED',
      entity: 'User',
      metadata: { reason: 'supabase_auth_rejected' },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AuthenticationError(LOGIN_ERROR_MESSAGE);
  }

  const profile = await resolveProfile(data.user);
  if (!profile?.isActive) {
    await supabase.auth.signOut({ scope: 'local' });
    throw new AuthenticationError(LOGIN_ERROR_MESSAGE);
  }

  await rateLimiter.reset(identifier);
  const { tenantId, tenantRole, storeId } = await resolveTenantContext(profile);

  await auditRepo.createAuditLog({
    tenantId,
    userId: profile.id,
    action: 'LOGIN',
    entity: 'User',
    entityId: profile.id,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  return {
    user: { id: profile.id, email: profile.email, name: profile.name },
    platformRole: profile.platformRole,
    tenantRole,
    tenantId,
    storeId,
    destination: resolvePostLoginDestination(
      { platformRole: profile.platformRole, tenantId },
      meta?.redirectTo,
    ),
  };
}

export async function logout(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;

  if (authUserId) {
    const profile = await userRepo.findUserByAuthUserId(authUserId);
    if (profile) {
      await auditRepo.createAuditLog({
        userId: profile.id,
        action: 'LOGOUT',
        entity: 'User',
        entityId: profile.id,
      });
    }
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw new AuthenticationError('Não foi possível encerrar a sessão.');
}

export async function validateCurrentSession(): Promise<SessionContext | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;
  if (error || !authUserId) return null;

  const profile = await userRepo.findUserByAuthUserId(authUserId);
  if (!profile?.isActive) return null;

  const { tenantId, tenantRole, storeId } = await resolveTenantContext(profile);

  return {
    userId: profile.id,
    authUserId,
    email: profile.email,
    name: profile.name,
    platformRole: profile.platformRole,
    tenantRole,
    tenantId,
    storeId,
  };
}
