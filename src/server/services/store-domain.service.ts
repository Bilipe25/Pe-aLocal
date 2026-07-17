import type { StoreDomainStatus, StoreDomainType } from '@prisma/client';

import {
  storeDomainRequestSchema,
  storeDomainStatusSchema,
  type StoreDomainRequestInput,
  type StoreDomainStatusInput,
} from '@/schemas/store-domain';
import { requireSuperAdminStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors';
import * as domainRepo from '@/server/repositories/store-domain.repository';
import { ensureStoreEntitlement } from '@/server/repositories/store-entitlement.repository';

function issues(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
}

export async function getAdminStoreDomains(tenantId: string, storeId: string) {
  await requireSuperAdminStoreAccess(tenantId, storeId);
  return domainRepo.listAdminStoreDomains(tenantId, storeId);
}

export async function requestStoreDomain(
  tenantId: string,
  storeId: string,
  rawInput: StoreDomainRequestInput,
) {
  const context = await requireSuperAdminStoreAccess(tenantId, storeId);
  const parsed = storeDomainRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError('O domínio informado é inválido.', issues(parsed.error));
  }
  const entitlement = await ensureStoreEntitlement(tenantId, storeId);
  const expectedSubdomain = `${context.store.slug}.pedidolocal.com.br`;
  if (parsed.data.domainType === 'SUBDOMAIN' && parsed.data.hostname !== expectedSubdomain) {
    throw new ValidationError(`O subdomínio desta loja deve ser ${expectedSubdomain}.`);
  }
  if (
    parsed.data.domainType === 'CUSTOM' &&
    (parsed.data.hostname === 'pedidolocal.com.br' ||
      parsed.data.hostname.endsWith('.pedidolocal.com.br'))
  ) {
    throw new ValidationError('Use o tipo SUBDOMAIN para hostnames da plataforma.');
  }
  if (parsed.data.domainType === 'CUSTOM' && !entitlement.customDomainEnabled) {
    throw new ValidationError('Domínio personalizado não está habilitado para esta loja.');
  }

  try {
    const domain = await getDb().$transaction(async (tx) => {
      const domain = await tx.storeDomain.create({
        data: {
          tenantId,
          storeId,
          hostname: parsed.data.hostname,
          domainType: parsed.data.domainType as StoreDomainType,
          verificationToken: crypto.randomUUID().replaceAll('-', ''),
        },
        select: domainRepo.domainSelect,
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          storeId,
          userId: context.session.userId,
          action: 'DOMAIN_REQUESTED',
          entity: 'StoreDomain',
          entityId: domain.id,
          metadata: { hostname: domain.hostname, domainType: domain.domainType },
        },
      });
      return domain;
    });
    return { domain, storeSlug: context.store.slug };
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      throw new ConflictError('Este hostname já está associado a outra loja.');
    }
    throw error;
  }
}

export async function changeStoreDomainStatus(
  tenantId: string,
  storeId: string,
  rawInput: StoreDomainStatusInput,
) {
  const context = await requireSuperAdminStoreAccess(tenantId, storeId);
  const parsed = storeDomainStatusSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError('O status do domínio é inválido.', issues(parsed.error));
  }
  if (parsed.data.isPrimary && parsed.data.status !== 'ACTIVE') {
    throw new ValidationError('Somente um domínio ativo pode ser marcado como primário.');
  }

  const domain = await getDb().$transaction(async (tx) => {
    const previous = await tx.storeDomain.findFirst({
      where: { id: parsed.data.domainId, tenantId, storeId },
      select: domainRepo.domainSelect,
    });
    if (!previous) throw new NotFoundError('Domínio', parsed.data.domainId);

    if (parsed.data.isPrimary) {
      await tx.storeDomain.updateMany({
        where: { tenantId, storeId, id: { not: previous.id }, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    const verifiedAt =
      parsed.data.status === 'ACTIVE' ? (previous.verifiedAt ?? new Date()) : previous.verifiedAt;
    const domain = await tx.storeDomain.update({
      where: { id: previous.id },
      data: {
        status: parsed.data.status as StoreDomainStatus,
        isPrimary: parsed.data.status === 'ACTIVE' ? parsed.data.isPrimary : false,
        verifiedAt,
      },
      select: domainRepo.domainSelect,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        storeId,
        userId: context.session.userId,
        action: 'DOMAIN_STATUS_CHANGED',
        entity: 'StoreDomain',
        entityId: domain.id,
        metadata: {
          hostname: domain.hostname,
          previousStatus: previous.status,
          nextStatus: domain.status,
          previousPrimary: previous.isPrimary,
          nextPrimary: domain.isPrimary,
        },
      },
    });
    return domain;
  });
  return { domain, storeSlug: context.store.slug };
}
