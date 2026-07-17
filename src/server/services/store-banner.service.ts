import { Prisma, type BannerDestinationType } from '@prisma/client';
import { z } from 'zod';

import { storeAssetUrl } from '@/features/assets/urls';
import {
  storeBannerDeleteSchema,
  storeBannerInputSchema,
  type StoreBannerInput,
} from '@/schemas/store-banner';
import { requireSuperAdminStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors';
import * as bannerRepo from '@/server/repositories/store-banner.repository';
import {
  ensureStoreEntitlement,
  lockStoreEntitlement,
} from '@/server/repositories/store-entitlement.repository';

function parseBanner(input: StoreBannerInput) {
  const parsed = storeBannerInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Os dados do banner são inválidos.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

function serializeBanner<T extends { asset: { id: string } | null }>(banner: T) {
  return {
    ...banner,
    imageUrl: banner.asset ? storeAssetUrl(banner.asset.id, 1280) : null,
  };
}

async function assertBannerReferences(
  tx: Prisma.TransactionClient,
  tenantId: string,
  storeId: string,
  storeSlug: string,
  input: ReturnType<typeof parseBanner>,
) {
  if (input.assetId) {
    const asset = await tx.storeAsset.findFirst({
      where: {
        id: input.assetId,
        tenantId,
        storeId,
        assetType: 'BANNER',
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!asset) {
      throw new ValidationError('Use um asset de banner ativo pertencente a esta loja.');
    }
  }

  const value = input.destinationValue;
  if (input.destinationType === 'NONE') return;
  if (!value) throw new ValidationError('Informe o destino do banner.');

  if (input.destinationType === 'INTERNAL_PATH') {
    const storePath = `/${storeSlug}`;
    const belongsToStore =
      value === storePath ||
      value.startsWith(`${storePath}/`) ||
      value.startsWith(`${storePath}?`) ||
      value.startsWith(`${storePath}#`);
    if (!belongsToStore || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) {
      throw new ValidationError('O caminho interno deve pertencer ao cardápio desta loja.');
    }
    return;
  }

  if (!z.uuid().safeParse(value).success) {
    throw new ValidationError('O identificador de destino do banner é inválido.');
  }

  const destination =
    input.destinationType === 'CATEGORY'
      ? await tx.category.findFirst({
          where: { id: value, tenantId, storeId, isActive: true },
          select: { id: true },
        })
      : input.destinationType === 'PRODUCT'
        ? await tx.product.findFirst({
            where: { id: value, tenantId, storeId, isAvailable: true },
            select: { id: true },
          })
        : await tx.coupon.findFirst({
            where: { id: value, tenantId, isActive: true },
            select: { id: true },
          });

  if (!destination) {
    throw new ValidationError('O destino não existe ou não pertence ao escopo da loja.');
  }
}

async function assertActiveBannerCapacity(
  tx: Prisma.TransactionClient,
  tenantId: string,
  storeId: string,
  input: ReturnType<typeof parseBanner>,
) {
  if (!input.isActive) return;
  const overlap = await tx.storeBanner.count({
    where: {
      tenantId,
      storeId,
      id: input.id ? { not: input.id } : undefined,
      isActive: true,
      AND: [
        input.endsAt ? { OR: [{ startsAt: null }, { startsAt: { lt: input.endsAt } }] } : {},
        input.startsAt ? { OR: [{ endsAt: null }, { endsAt: { gt: input.startsAt } }] } : {},
      ],
    },
  });
  if (overlap >= 3) {
    throw new ConflictError('No máximo três banners podem estar ativos no mesmo período.');
  }
}

export async function getAdminStoreBanners(tenantId: string, storeId: string) {
  await requireSuperAdminStoreAccess(tenantId, storeId);
  return (await bannerRepo.listAdminStoreBanners(tenantId, storeId)).map(serializeBanner);
}

export async function saveStoreBanner(
  tenantId: string,
  storeId: string,
  rawInput: StoreBannerInput,
) {
  const context = await requireSuperAdminStoreAccess(tenantId, storeId);
  const input = parseBanner(rawInput);
  await ensureStoreEntitlement(tenantId, storeId);

  return getDb().$transaction(async (tx) => {
    const entitlement = await lockStoreEntitlement(tx, tenantId, storeId);
    if (!entitlement) throw new ConflictError('Os limites da loja não estão disponíveis.');
    if ((input.startsAt || input.endsAt) && !entitlement.scheduledBannersEnabled) {
      throw new ValidationError('Banners agendados não estão habilitados para esta loja.');
    }

    const previous = input.id
      ? await tx.storeBanner.findFirst({
          where: { id: input.id, tenantId, storeId },
          select: bannerRepo.bannerSelect,
        })
      : null;
    if (input.id && !previous) throw new NotFoundError('Banner', input.id);
    if (!input.id) {
      const count = await tx.storeBanner.count({ where: { tenantId, storeId } });
      if (count >= entitlement.maxBanners) {
        throw new ConflictError(
          `Esta loja pode cadastrar no máximo ${entitlement.maxBanners} banners.`,
        );
      }
    }

    await assertBannerReferences(tx, tenantId, storeId, context.store.slug, input);
    await assertActiveBannerCapacity(tx, tenantId, storeId, input);

    const data = {
      tenantId,
      storeId,
      assetId: input.assetId,
      title: input.title,
      subtitle: input.subtitle,
      buttonText: input.buttonText,
      destinationType: input.destinationType as BannerDestinationType,
      destinationValue: input.destinationValue,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isActive: input.isActive,
      priority: input.priority,
    };
    const saved = previous
      ? await tx.storeBanner.update({
          where: { id: previous.id },
          data,
          select: bannerRepo.bannerSelect,
        })
      : await tx.storeBanner.create({ data, select: bannerRepo.bannerSelect });

    await tx.auditLog.create({
      data: {
        tenantId,
        storeId,
        userId: context.session.userId,
        action: previous ? 'BANNER_UPDATED' : 'BANNER_CREATED',
        entity: 'StoreBanner',
        entityId: saved.id,
        metadata: {
          previous: previous
            ? {
                title: previous.title,
                assetId: previous.assetId,
                destinationType: previous.destinationType,
                destinationValue: previous.destinationValue,
                startsAt: previous.startsAt,
                endsAt: previous.endsAt,
                isActive: previous.isActive,
                priority: previous.priority,
              }
            : null,
          next: {
            title: saved.title,
            assetId: saved.assetId,
            destinationType: saved.destinationType,
            destinationValue: saved.destinationValue,
            startsAt: saved.startsAt,
            endsAt: saved.endsAt,
            isActive: saved.isActive,
            priority: saved.priority,
          },
        },
      },
    });
    return { banner: serializeBanner(saved), storeSlug: context.store.slug };
  });
}

export async function deleteStoreBanner(tenantId: string, storeId: string, bannerId: string) {
  const context = await requireSuperAdminStoreAccess(tenantId, storeId);
  const parsed = storeBannerDeleteSchema.safeParse({ bannerId });
  if (!parsed.success) throw new ValidationError('O identificador do banner é inválido.');

  await getDb().$transaction(async (tx) => {
    const banner = await tx.storeBanner.findFirst({
      where: { id: parsed.data.bannerId, tenantId, storeId },
      select: { id: true, title: true, assetId: true, isActive: true },
    });
    if (!banner) throw new NotFoundError('Banner', bannerId);
    await tx.auditLog.create({
      data: {
        tenantId,
        storeId,
        userId: context.session.userId,
        action: 'BANNER_DELETED',
        entity: 'StoreBanner',
        entityId: banner.id,
        metadata: { title: banner.title, assetId: banner.assetId, wasActive: banner.isActive },
      },
    });
    await tx.storeBanner.delete({ where: { id: banner.id } });
  });
  return { storeSlug: context.store.slug };
}
