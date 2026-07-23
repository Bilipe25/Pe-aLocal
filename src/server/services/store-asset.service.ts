import type { StoreAssetType } from '@prisma/client';

import { storeAssetUrl } from '@/features/assets/urls';
import {
  storeAssetUploadMetadataSchema,
  type StoreAssetUploadMetadata,
} from '@/schemas/store-asset';
import { requireSuperAdmin, requireSuperAdminStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors';
import * as assetRepo from '@/server/repositories/store-asset.repository';
import {
  ensureStoreEntitlement,
  lockStoreEntitlement,
} from '@/server/repositories/store-entitlement.repository';
import {
  buildStoreAssetObjectKey,
  getStoreAssetRuntime,
  inspectStoreAssetFile,
} from '@/server/storage/store-assets';

function serializeAsset<T extends { id: string }>(asset: T) {
  return { ...asset, url: storeAssetUrl(asset.id), previewUrl: storeAssetUrl(asset.id, 384) };
}

export async function listAdminStoreAssets(tenantId: string, storeId: string) {
  await requireSuperAdminStoreAccess(tenantId, storeId);
  const assets = await assetRepo.listActiveStoreAssets(tenantId, storeId);
  return assets.map(serializeAsset);
}

async function _runUpload(
  tenantId: string,
  storeId: string,
  userId: string,
  file: File,
  rawMetadata: StoreAssetUploadMetadata,
) {
  const parsed = storeAssetUploadMetadataSchema.safeParse(rawMetadata);
  if (!parsed.success) {
    throw new ValidationError(
      'Os metadados do asset são inválidos.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  if (parsed.data.replaceAssetId) {
    const replaced = await assetRepo.findScopedStoreAsset(
      tenantId,
      storeId,
      parsed.data.replaceAssetId,
    );
    if (!replaced || replaced.status !== 'ACTIVE') throw new NotFoundError('Asset substituído');
    if (replaced.assetType !== parsed.data.assetType) {
      throw new ValidationError('O asset substituído deve possuir o mesmo tipo.');
    }
  }

  const runtime = await getStoreAssetRuntime();
  const inspected = await inspectStoreAssetFile(file, parsed.data.assetType, runtime);
  const assetId = crypto.randomUUID();
  const objectKey = buildStoreAssetObjectKey({
    tenantId,
    storeId,
    assetType: parsed.data.assetType,
    assetId,
    extension: inspected.extension,
  });

  await runtime.bucket.put(objectKey, inspected.buffer, {
    httpMetadata: {
      contentType: inspected.mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: { tenantId, storeId, assetType: parsed.data.assetType, assetId },
    sha256: await crypto.subtle.digest('SHA-256', inspected.buffer),
  });

  try {
    await ensureStoreEntitlement(tenantId, storeId);
    const asset = await getDb().$transaction(async (tx) => {
      const entitlement = await lockStoreEntitlement(tx, tenantId, storeId);
      if (!entitlement) throw new ConflictError('Os limites da loja não estão disponíveis.');
      const usage = await tx.storeAsset.aggregate({
        where: { tenantId, storeId, status: 'ACTIVE', deletedAt: null },
        _count: { id: true },
        _sum: { sizeBytes: true },
      });
      if (usage._count.id >= entitlement.maxAssetCount) {
        throw new ConflictError(
          `Esta loja pode manter no máximo ${entitlement.maxAssetCount} assets ativos.`,
        );
      }
      if ((usage._sum.sizeBytes ?? 0) + inspected.sizeBytes > entitlement.maxAssetStorageBytes) {
        throw new ConflictError('O limite de armazenamento de assets desta loja foi atingido.');
      }
      const created = await tx.storeAsset.create({
        data: {
          id: assetId,
          tenantId,
          storeId,
          assetType: parsed.data.assetType as StoreAssetType,
          objectKey,
          mimeType: inspected.mimeType,
          width: inspected.width,
          height: inspected.height,
          sizeBytes: inspected.sizeBytes,
          altText: parsed.data.altText,
          createdById: userId,
        },
        select: assetRepo.assetSelect,
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          storeId,
          userId,
          action: parsed.data.replaceAssetId ? 'ASSET_REPLACED' : 'ASSET_UPLOADED',
          entity: 'StoreAsset',
          entityId: created.id,
          metadata: {
            assetType: created.assetType,
            mimeType: created.mimeType,
            width: created.width,
            height: created.height,
            sizeBytes: created.sizeBytes,
            replacedAssetId: parsed.data.replaceAssetId ?? null,
          },
        },
      });
      return created;
    });
    return serializeAsset(asset);
  } catch (error) {
    await runtime.bucket.delete(objectKey).catch(() => undefined);
    throw error;
  }
}

/** Upload via SUPER_ADMIN (rota /api/admin/...) */
export async function uploadStoreAsset(
  tenantId: string,
  storeId: string,
  file: File,
  rawMetadata: StoreAssetUploadMetadata,
) {
  const context = await requireSuperAdminStoreAccess(tenantId, storeId);
  return _runUpload(tenantId, storeId, context.session.userId, file, rawMetadata);
}

/**
 * Upload via membro do tenant (OWNER / MANAGER) com permissão MANAGE_PRODUCT_IMAGES.
 * A autorização já foi feita pelo chamador; userId validado via requireActiveStoreContext.
 */
export async function uploadStoreAssetAsTenantMember(
  tenantId: string,
  storeId: string,
  file: File,
  rawMetadata: StoreAssetUploadMetadata,
  userId: string,
) {
  return _runUpload(tenantId, storeId, userId, file, rawMetadata);
}

export async function deleteStoreAsset(tenantId: string, storeId: string, assetId: string) {
  const context = await requireSuperAdminStoreAccess(tenantId, storeId);
  const asset = await assetRepo.findScopedStoreAsset(tenantId, storeId, assetId);
  if (!asset || asset.status !== 'ACTIVE') throw new NotFoundError('Asset', assetId);
  if (await assetRepo.isStoreAssetReferenced(tenantId, storeId, assetId)) {
    throw new ConflictError(
      'Este asset ainda está referenciado pelo publicado, rascunho ou histórico e não pode ser excluído.',
    );
  }

  const deletedAt = new Date();
  await getDb().$transaction(async (tx) => {
    const updated = await tx.storeAsset.updateMany({
      where: { id: assetId, tenantId, storeId, status: 'ACTIVE', deletedAt: null },
      data: { status: 'DELETED', deletedAt },
    });
    if (updated.count !== 1) throw new ConflictError('O asset já foi alterado.');
    await tx.auditLog.create({
      data: {
        tenantId,
        storeId,
        userId: context.session.userId,
        action: 'ASSET_DELETED',
        entity: 'StoreAsset',
        entityId: assetId,
        metadata: { assetType: asset.assetType, objectRetainedForGarbageCollection: true },
      },
    });
  });
}

export async function garbageCollectDeletedStoreAssets(input?: {
  olderThanDays?: number;
  take?: number;
}) {
  await requireSuperAdmin();
  const olderThanDays = Math.max(7, Math.min(input?.olderThanDays ?? 30, 365));
  const take = Math.max(1, Math.min(input?.take ?? 50, 200));
  const before = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const runtime = await getStoreAssetRuntime();
  const candidates = await assetRepo.listGarbageCollectableAssets(before, take);
  let deleted = 0;

  for (const asset of candidates) {
    if (await assetRepo.isStoreAssetReferenced(asset.tenantId, asset.storeId, asset.id)) continue;
    await runtime.bucket.delete(asset.objectKey);
    const result = await assetRepo.hardDeleteStoreAsset(asset.id);
    deleted += result.count;
  }

  return { scanned: candidates.length, deleted, before };
}
