import { Prisma } from '@prisma/client';

import { assertCustomizationEntitlement } from '@/features/customization/entitlements';
import { migrateCustomizationToCurrentVersion } from '@/features/customization/domain/migrations';
import {
  storeEntitlementInputSchema,
  type StoreEntitlementInput,
} from '@/schemas/store-entitlement';
import { requireSuperAdminStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { ConflictError, ValidationError } from '@/server/errors';
import { isDeployedRuntime } from '@/server/runtime-environment';
import { isConsumerVerificationReady } from '@/server/consumer-verification/provider';
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
  try {
    return migrateCustomizationToCurrentVersion(value);
  } catch {
    throw new ValidationError(
      'A configuração atual da loja precisa ser corrigida antes dos limites.',
    );
  }
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
  if (
    parsed.data.consumerIdentityEnabled &&
    isDeployedRuntime() &&
    !isConsumerVerificationReady()
  ) {
    throw new ValidationError(
      'Configure e valide o provedor de confirmação antes de ativar Conta do cliente e Clientes.',
    );
  }

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

    const [databaseClock] = await tx.$queryRaw<{ now: Date }[]>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP AS "now"`,
    );
    const operationalSlaEnabledAt = parsed.data.operationalSlaEnabled
      ? current.operationalSlaEnabled
        ? current.operationalSlaEnabledAt
        : (databaseClock?.now ?? new Date())
      : null;

    const updated = await tx.storeEntitlement.update({
      where: { storeId },
      data: { ...parsed.data, operationalSlaEnabledAt },
      select: entitlementSelect,
    });
    if (current.operationalSlaEnabled && !parsed.data.operationalSlaEnabled) {
      const disabledAt = databaseClock?.now ?? new Date();
      await tx.orderOperationalSlaDelivery.updateMany({
        where: {
          tenantId,
          storeId,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'SKIPPED',
          failedAt: disabledAt,
          lockedAt: null,
          lockToken: null,
          lastError: 'operational_sla_disabled',
        },
      });
      await tx.orderOperationalSlaAlert.updateMany({
        where: { tenantId, storeId, resolvedAt: null },
        data: { resolvedAt: disabledAt },
      });
    }
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
            onlinePaymentsEnabled: current.onlinePaymentsEnabled,
            operationalSlaEnabled: current.operationalSlaEnabled,
            operationalSlaEnabledAt: current.operationalSlaEnabledAt?.toISOString() ?? null,
            kdsEnabled: current.kdsEnabled,
            advancedReportsEnabled: current.advancedReportsEnabled,
            orderPrintingEnabled: current.orderPrintingEnabled,
            dineInQrEnabled: current.dineInQrEnabled,
            combosPromotionsEnabled: current.combosPromotionsEnabled,
            posEnabled: current.posEnabled,
            consumerIdentityEnabled: current.consumerIdentityEnabled,
          },
          next: {
            ...parsed.data,
            operationalSlaEnabledAt: operationalSlaEnabledAt?.toISOString() ?? null,
          },
        },
      },
    });
    return { entitlement: updated, storeSlug: context.store.slug };
  });
}
