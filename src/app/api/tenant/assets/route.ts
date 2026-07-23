import { updateTag } from 'next/cache';
import { z } from 'zod';

import { tenantStoreAssetUrl } from '@/features/assets/urls';
import { storeAssetUploadMetadataSchema } from '@/schemas/store-asset';
import { CACHE_TAGS } from '@/server/cache';
import { requireActiveStoreContext } from '@/server/services/store-context.service';
import { errorToResponse, ValidationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { uploadProductImageAsTenantMember } from '@/server/services/store-asset.service';

const MAX_MULTIPART_BYTES = 6 * 1024 * 1024;

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

    const productId = z.uuid().safeParse(formData.get('productId'));
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

    updateTag(CACHE_TAGS.catalog(store.id));
    updateTag(CACHE_TAGS.assets(store.id));
    updateTag(CACHE_TAGS.asset(asset.id));
    if (replacedAssetId) updateTag(CACHE_TAGS.asset(replacedAssetId));

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
