import { Prisma } from '@prisma/client';

import { assertCustomizationEntitlement } from '@/features/customization/entitlements';
import { storeCustomizationConfigSchema } from '@/schemas/customization';
import {
  storeEntitlementInputSchema,
  type StoreEntitlementInput,
} from '@/schemas/store-entitlement';
import { requireSuperAdminStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { ConflictError, ValidationError } from '@/server/errors';
import {
  ensureStoreEntitlement,
  entitlementSelect,
  lockStoreEntitlement,
} from '@/server/repositories/store-entitlement.repository';

export async function getAdminStoreEntitlement(tenantId: string, storeId: string) {
  await requireSuperAdminStoreAccess(tenantId, storeId);
  return ensureStoreEntitlement(tenantId, storeId);
}

function parseCustomization(value: Prisma.JsonValue | null) {
  if (value === null) return null;
  const parsed = storeCustomizationConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      'A configuração atual da loja precisa ser corrigida antes dos limites.',
    );
  }
  return parsed.data;
}

export async function updateStoreEntitlement(
  tenantId: string,
  storeId: string,
  rawInput: StoreEntitlementInput,
) {
  const context = await requireSuperAdminStoreAccess(tenantId, storeId);
  const parsed = storeEntitlementInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      'Os limites informados são inválidos.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  await ensureStoreEntitlement(tenantId, storeId);

  return getDb().$transaction(async (tx) => {
    const locked = await lockStoreEntitlement(tx, tenantId, storeId);
    if (!locked) throw new ConflictError('Os limites da loja não estão disponíveis.');
    const current = await tx.storeEntitlement.findUniqueOrThrow({
      where: { storeId },
      select: entitlementSelect,
    });
    const [assets, bannerCount, scheduledBannerCount, customDomainCount, customization] =
      await Promise.all([
        tx.storeAsset.aggregate({
          where: { tenantId, storeId, status: 'ACTIVE', deletedAt: null },
          _count: { id: true },
          _sum: { sizeBytes: true },
        }),
        tx.storeBanner.count({ where: { tenantId, storeId } }),
        tx.storeBanner.count({
          where: {
            tenantId,
            storeId,
            OR: [{ startsAt: { not: null } }, { endsAt: { not: null } }],
          },
        }),
        tx.storeDomain.count({
          where: { tenantId, storeId, domainType: 'CUSTOM', status: { not: 'DISABLED' } },
        }),
        tx.storeCustomization.findUnique({
          where: { storeId },
          select: { publishedConfig: true, draftConfig: true },
        }),
      ]);

    const usedAssetCount = assets._count.id;
    const usedStorageBytes = assets._sum.sizeBytes ?? 0;
    if (parsed.data.maxAssetCount < usedAssetCount) {
      throw new ValidationError(`A loja já possui ${usedAssetCount} assets ativos.`);
    }
    if (parsed.data.maxAssetStorageBytes < usedStorageBytes) {
      throw new ValidationError(`A loja já utiliza ${usedStorageBytes} bytes de armazenamento.`);
    }
    if (parsed.data.maxBanners < bannerCount) {
      throw new ValidationError(`A loja já possui ${bannerCount} banners cadastrados.`);
    }
    if (!parsed.data.scheduledBannersEnabled && scheduledBannerCount > 0) {
      throw new ValidationError(
        'Remova os agendamentos existentes antes de desabilitar o recurso.',
      );
    }
    if (!parsed.data.customDomainEnabled && customDomainCount > 0) {
      throw new ValidationError('Desabilite os domínios personalizados existentes primeiro.');
    }

    const published = customization ? parseCustomization(customization.publishedConfig) : null;
    const draft = customization ? parseCustomization(customization.draftConfig) : null;
    if (published) assertCustomizationEntitlement(published, parsed.data);
    if (draft) assertCustomizationEntitlement(draft, parsed.data);

    const updated = await tx.storeEntitlement.update({
      where: { storeId },
      data: parsed.data,
      select: entitlementSelect,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        storeId,
        userId: context.session.userId,
        action: 'ENTITLEMENT_UPDATED',
        entity: 'StoreEntitlement',
        entityId: updated.id,
        metadata: {
          previous: {
            maxAssetCount: current.maxAssetCount,
            maxAssetStorageBytes: current.maxAssetStorageBytes,
            maxBanners: current.maxBanners,
            allowedLayoutTemplates: current.allowedLayoutTemplates,
            allowedVisualPresets: current.allowedVisualPresets,
            advancedTypographyEnabled: current.advancedTypographyEnabled,
            customDomainEnabled: current.customDomainEnabled,
            platformBrandingRemovalEnabled: current.platformBrandingRemovalEnabled,
            scheduledBannersEnabled: current.scheduledBannersEnabled,
          },
          next: parsed.data,
        },
      },
    });
    return updated;
  });
}
