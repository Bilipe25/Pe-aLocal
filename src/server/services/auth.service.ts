import { loginSchema, type LoginInput } from '@/schemas/auth';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import * as userRepo from '@/server/repositories/user.repository';
import * as memberRepo from '@/server/repositories/tenant-member.repository';
import * as auditRepo from '@/server/repositories/audit-log.repository';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { AuthenticationError, RateLimitError, ValidationError } from '@/server/errors';
import type { SessionContext } from '@/server/auth';

const LOGIN_ERROR_MESSAGE = 'E-mail ou senha incorretos.';

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

export async function login(
  input: LoginInput,
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<{
  user: { id: string; email: string; name: string };
  tenantId: string | null;
  storeId: string | null;
  role: string | null;
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
  const membership = await memberRepo.findFirstActiveMembership(profile.id);
  const tenantId = membership?.tenantId ?? null;
  const role = membership?.role ?? null;
  const storeId = membership?.tenant?.stores?.[0]?.id ?? null;

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
    tenantId,
    storeId,
    role,
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

  const membership = await memberRepo.findFirstActiveMembership(profile.id);

  return {
    userId: profile.id,
    authUserId,
    email: profile.email,
    name: profile.name,
    role: membership?.role ?? null,
    tenantId: membership?.tenantId ?? null,
    storeId: membership?.tenant?.stores?.[0]?.id ?? null,
  };
}
