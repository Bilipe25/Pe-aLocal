import { createAdminClient } from '@/lib/supabase/admin';
import * as tenantRepo from '@/server/repositories/tenant.repository';
import * as memberRepo from '@/server/repositories/tenant-member.repository';
import * as userRepo from '@/server/repositories/user.repository';
import { ConflictError } from '@/server/errors';

async function createAuthIdentity(email: string, password: string, name: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: false,
    user_metadata: { name },
  });

  if (error || !data.user) {
    throw new ConflictError('Não foi possível criar a identidade de acesso.');
  }
  return data.user;
}

// =============================================================================
// Tenant Service
// =============================================================================

/**
 * Cria um tenant com seu owner inicial.
 */
export async function createTenantWithOwner(data: {
  tenantName: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  document?: string;
}) {
  // 1. Verificar unicidade do e-mail
  const exists = await userRepo.emailExists(data.ownerEmail);
  if (exists) {
    throw new ConflictError('Este e-mail já está em uso.');
  }

  const authUser = await createAuthIdentity(data.ownerEmail, data.ownerPassword, data.ownerName);

  // 2. Criar tenant
  const tenant = await tenantRepo.createTenant({
    name: data.tenantName,
    document: data.document,
    status: 'ACTIVE',
  });

  // 3. Criar owner
  const owner = await userRepo.createUser({
    authUserId: authUser.id,
    email: data.ownerEmail,
    name: data.ownerName,
  });

  // 4. Vincular como OWNER
  await memberRepo.createMembership({
    tenantId: tenant.id,
    userId: owner.id,
    role: 'OWNER',
  });

  return { tenant, owner };
}

/**
 * Adiciona um membro a um tenant existente.
 */
export async function addTenantMember(data: {
  tenantId: string;
  email: string;
  name: string;
  password: string;
  role: 'MANAGER' | 'ATTENDANT';
}) {
  // Buscar ou criar usuário
  const existingUser = await userRepo.findUserByEmail(data.email);

  let userId: string;

  if (existingUser) {
    // Verificar se já é membro deste tenant
    const existingMembership = await memberRepo.findMembership(existingUser.id, data.tenantId);
    if (existingMembership) {
      throw new ConflictError('Este usuário já é membro deste estabelecimento.');
    }
    userId = existingUser.id;
  } else {
    const authUser = await createAuthIdentity(data.email, data.password, data.name);
    const newUser = await userRepo.createUser({
      authUserId: authUser.id,
      email: data.email,
      name: data.name,
    });
    userId = newUser.id;
  }

  // Criar vínculo
  await memberRepo.createMembership({
    tenantId: data.tenantId,
    userId,
    role: data.role,
  });

  return { userId };
}
