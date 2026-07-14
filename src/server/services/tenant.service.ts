import { hashPassword } from '@/server/auth/password';
import * as tenantRepo from '@/server/repositories/tenant.repository';
import * as memberRepo from '@/server/repositories/tenant-member.repository';
import * as userRepo from '@/server/repositories/user.repository';
import { ConflictError } from '@/server/errors';

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

  // 2. Criar tenant
  const tenant = await tenantRepo.createTenant({
    name: data.tenantName,
    document: data.document,
    status: 'ACTIVE',
  });

  // 3. Criar owner
  const passwordHash = await hashPassword(data.ownerPassword);
  const owner = await userRepo.createUser({
    email: data.ownerEmail,
    name: data.ownerName,
    passwordHash,
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
    const passwordHash = await hashPassword(data.password);
    const newUser = await userRepo.createUser({
      email: data.email,
      name: data.name,
      passwordHash,
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
