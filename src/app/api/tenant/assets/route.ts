import { revalidateTag } from 'next/cache';
import { z } from 'zod';

import { tenantStoreAssetUrl } from '@/features/assets/urls';
import { storeAssetUploadMetadataSchema } from '@/schemas/store-asset';
import { CACHE_TAGS } from '@/server/cache';
import { requireActiveStoreContext } from '@/server/services/store-context.service';
import { errorToResponse, ValidationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { uploadProductImageAsTenantMember } from '@/server/services/store-asset.service';

const MAX_MULTIPART_BYTES = 6 * 1024 * 1024;

function revalidateProductAssetCaches(
  storeId: string,
  assetId: string,
  replacedAssetId: string | null,
) {
  try {
    revalidateTag(CACHE_TAGS.catalog(storeId), { expire: 0 });
    revalidateTag(CACHE_TAGS.assets(storeId), { expire: 0 });
    revalidateTag(CACHE_TAGS.asset(assetId), { expire: 0 });
    if (replacedAssetId) revalidateTag(CACHE_TAGS.asset(replacedAssetId), { expire: 0 });
  } catch (error) {
    // A mutação já foi confirmada no banco e no R2. Não induza o cliente a
    // repetir um upload concluído por causa de uma falha secundária de cache.
    console.error('[ASSET_CACHE_REVALIDATION_ERROR]', error);
  }
}

/**
 * Upload e associação atômica de imagem de produto para a loja ativa.
 */
export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_MULTIPART_BYTES) {
      throw new ValidationError('O upload excede o limite permitido.');
    }

    // Autoriza antes de materializar o multipart em memória
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_PRODUCT_IMAGES);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new ValidationError('Selecione um arquivo de imagem.');

    // IDs determinísticos do seed seguem o formato GUID, mas não carregam
    // necessariamente os bits de versão exigidos por z.uuid().
    const productId = z.guid().safeParse(formData.get('productId'));
    if (!productId.success) throw new ValidationError('O produto informado é inválido.');

    const metadata = storeAssetUploadMetadataSchema.safeParse({
      assetType: 'PRODUCT_IMAGE',
      altText: formData.get('altText'),
    });
    if (!metadata.success) {
      throw new ValidationError(
        'Os metadados do asset são inválidos.',
        metadata.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    const { asset, replacedAssetId } = await uploadProductImageAsTenantMember({
      tenantId: session.tenantId,
      storeId: store.id,
      productId: productId.data,
      userId: session.userId,
      file,
      altText: metadata.data.altText,
    });

    revalidateProductAssetCaches(store.id, asset.id, replacedAssetId);

    const serializedAsset = {
      ...asset,
      url: tenantStoreAssetUrl(asset.id, 768),
      previewUrl: tenantStoreAssetUrl(asset.id, 384),
    };
    return Response.json(
      { asset: serializedAsset },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
